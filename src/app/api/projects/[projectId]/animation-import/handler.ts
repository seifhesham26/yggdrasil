import { createHash, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { ProjectHistory } from "@/features/projects/application/project-history";
import type { AssetAnalysis } from "@/features/assets/domain/types";
import { parseProjectSnapshot } from "@/features/projects/domain/project-state";
import { analyzeImportedClip, attachImportedClip, parseImportedAnimationSource, targetRootFromNames, targetRootFromRigNodes, type ImportedClipAttachment } from "@/features/viewer/imported-clips";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import type { AssetStorage } from "@/lib/storage/types";

type Session = { user: { id: string } } | null;
type Deps = {
  getSession: (headers: Headers) => Promise<Session>;
  history: Pick<ProjectHistory, "load" | "save">;
  getTargetAnalysis: (ownerId: string, assetId: string, versionId: string) => Promise<Pick<AssetAnalysis, "nodeNames" | "rigNodes"> | null>;
  storage: Pick<AssetStorage, "put" | "removeTree">;
};

function safeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.split(/[\\/]/).at(-1) ?? "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,239}$/.test(name) ? name : null;
}

function decodedBytes(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !value || value.length > 12 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.length > 0 && bytes.length <= 8 * 1024 * 1024 && bytes.toString("base64") === value ? new Uint8Array(bytes) : null;
}

export function createAnimationImportHandler(deps: Deps) {
  return async function POST(projectId: string, request: Request): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const state = await deps.history.load(session.user.id, projectId);
    if (!state) return Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
    const targetAnalysis = await deps.getTargetAnalysis(session.user.id, state.project.assetId, state.project.assetVersionId);
    if (!targetAnalysis) return Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
      body = parsed as Record<string, unknown>;
    } catch { return Response.json({ code: "INVALID_JSON" }, { status: 400 }); }
    const sourceFileName = safeName(body.fileName);
    const bytes = decodedBytes(body.bytesBase64);
    const supplied = body.clip;
    if (!sourceFileName || !bytes || !supplied || typeof supplied !== "object" || Array.isArray(supplied)) return Response.json({ code: "INVALID_IMPORT", message: "Animation source or mapping is invalid." }, { status: 400 });

    const input = supplied as Partial<ImportedClipAttachment>;
    if (!Number.isInteger(input.sourceClipIndex) || (input.sourceClipIndex ?? -1) < 0 || (input.sourceClipIndex ?? 200) >= 200 || !Array.isArray(input.mapping) || !Array.isArray(input.tracks)) return Response.json({ code: "INVALID_IMPORT", message: "Animation mapping is invalid." }, { status: 400 });
    const id = randomUUID();
    const prefix = parseStorageKey(`projects/${projectId}/animation-imports/${id}`);
    const sourceStorageKey = parseStorageKey(`${prefix}/${sourceFileName}`);
    const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    let attachment: ImportedClipAttachment;
    try {
      const source = await parseImportedAnimationSource(bytes, sourceFileName, input.sourceClipIndex);
      const targetRoot = targetAnalysis.rigNodes?.length ? targetRootFromRigNodes(targetAnalysis.rigNodes) : targetRootFromNames(targetAnalysis.nodeNames);
      const analysis = analyzeImportedClip(source.clip, source.root, targetRoot);
      const manualMapping = Object.fromEntries(input.mapping.filter((entry) => entry?.status === "manual" && entry.targetBone).map((entry) => [entry.sourceBone, entry.targetBone!]));
      attachment = attachImportedClip({ ...analysis, manualMapping }, { id, sourceFileName, sourceStorageKey, sourceSha256, sourceClipIndex: source.sourceClipIndex });
      if (input.name !== attachment.name || input.durationSeconds !== attachment.durationSeconds || JSON.stringify(input.tracks) !== JSON.stringify(attachment.tracks) || JSON.stringify(input.mapping) !== JSON.stringify(attachment.mapping)) throw new Error("Animation mapping does not match the uploaded source.");
    } catch (error) {
      return Response.json({ code: "INVALID_IMPORT", message: error instanceof Error ? error.message : "Animation source is invalid." }, { status: 400 });
    }

    let snapshot;
    try { snapshot = parseProjectSnapshot({ ...state.project.snapshot, animation: { ...state.project.snapshot.animation, importedClips: [...state.project.snapshot.animation.importedClips, attachment] } }); }
    catch (error) { return Response.json({ code: "INVALID_IMPORT", message: error instanceof ZodError ? "Animation attachment exceeds project limits." : "Animation attachment is invalid." }, { status: 400 }); }
    let wrote = false;
    try {
      await deps.storage.put(sourceStorageKey as StorageKey, bytes);
      wrote = true;
      const saved = await deps.history.save({ ownerId: session.user.id, projectId, expectedRevision: state.project.revision, snapshot, activeStep: "Animate" });
      return Response.json(saved);
    } catch (error) {
      if (wrote) await deps.storage.removeTree(prefix).catch(() => undefined);
      if (/stale/i.test(error instanceof Error ? error.message : "")) return Response.json({ code: "STALE_PROJECT_REVISION" }, { status: 409 });
      return Response.json({ code: "PROJECT_STORAGE_UNAVAILABLE", message: "Animation import could not be saved. Retry without changing the project." }, { status: 503 });
    }
  };
}

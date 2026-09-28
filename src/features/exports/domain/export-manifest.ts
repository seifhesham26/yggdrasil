import { createHash } from "node:crypto";
import { z } from "zod";
import { ProjectSnapshotSchema, parseProjectSnapshot } from "@/features/projects/domain/project-state";
import type { Project } from "@/features/projects/application/project-history";
import type { StoredAssetFile } from "@/features/assets/infrastructure/asset-repository";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";

const PortableImportedClip = z.object({ ...ProjectSnapshotSchema.shape.animation.shape.importedClips.element.shape, sourceStorageKey: z.never().optional() }).strict();
const PortableAnimation = z.object({ ...ProjectSnapshotSchema.shape.animation.shape, importedClips: z.array(PortableImportedClip), clips: z.array(z.never()).max(0) }).strict();
export const PortableProjectSchema = z.object({ ...ProjectSnapshotSchema.shape, animation: PortableAnimation }).strict();
const PortablePath = z.string().min(1).max(500).refine((path) => safePortablePath(path) === path, "Unsafe portable path.");
export const ExportManifestSchema = z.object({
  formatVersion: z.literal(1), projectId: z.string().uuid(), projectName: z.string().min(1), projectRevision: z.number().int().min(0),
  projectRevisionId: z.string().uuid().nullable(), assetVersionId: z.string().uuid(), createdAt: z.iso.datetime(),
  modelPath: PortablePath, files: z.array(z.object({ path: PortablePath, sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().min(0), mimeType: z.string().min(1), role: z.enum(["model", "dependency", "attribution"]) }).strict()).min(1).max(10000),
  config: PortableProjectSchema, attribution: z.array(z.object({ path: PortablePath, text: z.string().max(65536) }).strict()), warnings: z.array(z.string().max(500)),
}).strict().superRefine((manifest, context) => {
  if (!manifest.files.some((file) => file.path === manifest.modelPath && file.role === "model")) context.addIssue({ code: "custom", path: ["modelPath"], message: "Model file is missing." });
  if (new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length) context.addIssue({ code: "custom", path: ["files"], message: "Duplicate output paths." });
  for (const path of manifest.config.export.criticalAssetIds) if (!manifest.files.some((file) => file.path === path)) context.addIssue({ code: "custom", path: ["config", "export", "criticalAssetIds"], message: `Critical asset ${path} is not in the output.` });
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export type VersionFile = { id: string; storageKey: string; relativePath: string; byteSize: number; sha256: string; mimeType: string };
export type ResolvedExportFile = { path: string; storageKey: StorageKey; sha256: string; byteSize: number; mimeType: string; role: "model" | "dependency" | "attribution" };

export function safePortablePath(path: string): string | null {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[a-z]:/i.test(path) || path.includes("\\") || /[\x00-\x1f\x7f:?*"<>|]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" ") || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return null;
  return path;
}

function noSecrets(text: string) {
  if (/postgres(?:ql)?:\/\/|BETTER_AUTH_SECRET|DATABASE_URL|[a-z]:\\|\/(?:home|Users)\//i.test(text)) throw new Error("Export contains a secret or machine-local path.");
}

/** Plan public paths without exposing source storage keys in the manifest. */
export async function buildExportManifest(project: Pick<Project, "id" | "name" | "revision" | "currentRevisionId" | "assetVersionId" | "snapshot">, version: VersionFile, sourceFiles: StoredAssetFile[], storage: Pick<AssetStorage, "read">, now = new Date()): Promise<{ manifest: ExportManifest; files: ResolvedExportFile[] }> {
  if (project.assetVersionId !== version.id) throw new Error("Project asset version no longer matches its retained version.");
  const snapshot = parseProjectSnapshot(project.snapshot);
  if (snapshot.animation.clips.length) throw new Error("Legacy untyped animation clips cannot be exported.");
  if (snapshot.interactions.some((interaction) => interaction.action.type === "play-clip")) throw new Error("Play-clip interactions are unsupported by this export runtime.");
  const availableClips = new Set([...snapshot.animation.embeddedClips, ...snapshot.animation.importedClips].map((clip) => clip.id));
  if (snapshot.animation.sequence.some((segment) => !availableClips.has(segment.clipId))) throw new Error("Sequence references an unavailable clip.");
  if (snapshot.animation.timelines.some((timeline) => timeline.trigger.type.startsWith("clip-") && !availableClips.has(timeline.trigger.targetId ?? "") && !(timeline.trigger.targetId === "sequence" && snapshot.animation.sequence.length))) throw new Error("Timeline trigger references an unavailable clip.");
  const original = sourceFiles.find((file) => file.storageKey === version.storageKey);
  const isSourceModel = Boolean(original);
  const selectedPath = isSourceModel ? `assets/source/${safePortablePath(version.relativePath) ?? ""}` : `assets/model.${version.mimeType === "model/gltf-binary" ? "glb" : "gltf"}`;
  const candidates: ResolvedExportFile[] = [{ path: selectedPath, storageKey: parseStorageKey(version.storageKey), sha256: version.sha256, byteSize: version.byteSize, mimeType: version.mimeType, role: "model" }];
  for (const file of sourceFiles) {
    if (file.storageKey === version.storageKey) continue;
    if (!isSourceModel && file.role !== "attribution") continue;
    if (isSourceModel && file.role === "source") continue;
    const path = `${isSourceModel ? "assets/source" : "assets/attribution"}/${safePortablePath(file.relativePath) ?? ""}`;
    candidates.push({ path, storageKey: parseStorageKey(file.storageKey), sha256: file.sha256, byteSize: file.byteSize, mimeType: file.mimeType, role: file.role === "attribution" ? "attribution" : "dependency" });
  }
  const files: ResolvedExportFile[] = [];
  const attribution: ExportManifest["attribution"] = [];
  for (const file of candidates) {
    if (!safePortablePath(file.path)) throw new Error("Unsafe output path.");
    const bytes = await storage.read(file.storageKey);
    if (bytes.byteLength !== file.byteSize || createHash("sha256").update(bytes).digest("hex") !== file.sha256.toLowerCase()) throw new Error(`Export source ${file.path} is missing or changed.`);
    if (file.role === "attribution") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.length > 65536) throw new Error("Attribution text is too large.");
      noSecrets(text);
      attribution.push({ path: file.path, text });
    }
    files.push(file);
  }
  for (const clip of snapshot.animation.importedClips) {
    const bytes = await storage.read(parseStorageKey(clip.sourceStorageKey));
    if (createHash("sha256").update(bytes).digest("hex") !== clip.sourceSha256.toLowerCase()) throw new Error(`Imported clip ${clip.name} source is missing or changed.`);
  }
  const portable = { ...snapshot, animation: { ...snapshot.animation, importedClips: snapshot.animation.importedClips.map(({ sourceStorageKey: _privateKey, ...clip }) => clip) } };
  const config = PortableProjectSchema.parse(portable);
  const warnings = attribution.length ? [] : ["Attribution and license terms were not provided with this asset; review redistribution rights before publishing."];
  const manifest = ExportManifestSchema.parse({ formatVersion: 1, projectId: project.id, projectName: project.name, projectRevision: project.revision, projectRevisionId: project.currentRevisionId,
    assetVersionId: version.id, createdAt: now.toISOString(), modelPath: selectedPath, files: files.map(({ storageKey: _privateKey, ...file }) => file), config, attribution, warnings });
  noSecrets(JSON.stringify(manifest));
  return { manifest, files };
}

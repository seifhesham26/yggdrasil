import { createHash } from "node:crypto";
import type { ExportService } from "@/features/exports/application/export-service";
import { publicExportJob } from "@/features/exports/application/export-service";
import type { ProjectHistory } from "@/features/projects/application/project-history";
import type { AssetStorage } from "@/lib/storage/types";

type Session = { user: { id: string } } | null;
type History = Pick<ProjectHistory, "load">;

export function createExportHandler(deps: { getSession: (headers: Headers) => Promise<Session>; history: History; service: ExportService; storage: Pick<AssetStorage, "read"> }) {
  async function owner(request: Request, projectId: string) {
    const session = await deps.getSession(request.headers);
    if (!session) return { response: Response.json({ code: "UNAUTHORIZED" }, { status: 401 }) };
    const project = await deps.history.load(session.user.id, projectId);
    if (!project) return { response: Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 }) };
    return { ownerId: session.user.id };
  }
  return {
    async GET(request: Request, projectId: string): Promise<Response> {
      const access = await owner(request, projectId); if (access.response) return access.response;
      try { return Response.json({ jobs: (await deps.service.list(access.ownerId!, projectId)).map(publicExportJob) }, { headers: { "cache-control": "no-store" } }); }
      catch { return Response.json({ code: "EXPORT_UNAVAILABLE" }, { status: 503 }); }
    },
    async POST(request: Request, projectId: string): Promise<Response> {
      const access = await owner(request, projectId); if (access.response) return access.response;
      let input: unknown;
      try { input = await request.json(); } catch { return Response.json({ code: "INVALID_JSON" }, { status: 400 }); }
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !["manifest", "react"].includes(String((input as { target?: unknown }).target))) return Response.json({ code: "UNSUPPORTED_EXPORT_TARGET" }, { status: 400 });
      try {
        const job = await deps.service.create(access.ownerId!, projectId, (input as { target: "manifest" | "react" }).target);
        return job ? Response.json(publicExportJob(job), { status: 201, headers: { "cache-control": "no-store" } }) : Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
      } catch { return Response.json({ code: "EXPORT_UNAVAILABLE" }, { status: 503 }); }
    },
    async RETRY(request: Request, projectId: string, jobId: string): Promise<Response> {
      const access = await owner(request, projectId); if (access.response) return access.response;
      const existing = await deps.service.get(access.ownerId!, jobId);
      if (!existing || existing.projectId !== projectId) return Response.json({ code: "EXPORT_NOT_FOUND" }, { status: 404 });
      try {
        const job = await deps.service.retry(access.ownerId!, jobId);
        return job ? Response.json(publicExportJob(job), { headers: { "cache-control": "no-store" } }) : Response.json({ code: "EXPORT_NOT_RETRYABLE" }, { status: 409 });
      } catch { return Response.json({ code: "EXPORT_UNAVAILABLE" }, { status: 503 }); }
    },
    async ARTIFACT(request: Request, projectId: string, jobId: string): Promise<Response> {
      const access = await owner(request, projectId); if (access.response) return access.response;
      const job = await deps.service.get(access.ownerId!, jobId);
      if (!job || job.projectId !== projectId || job.status !== "ready") return Response.json({ code: "EXPORT_NOT_FOUND" }, { status: 404 });
      try {
        const artifact = await deps.service.artifact(access.ownerId!, jobId);
        if (!artifact) throw new Error("Export artifact is missing.");
        const bytes = await deps.storage.read(artifact.storageKey);
        if (bytes.byteLength !== artifact.byteSize || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("Export artifact changed.");
        return new Response(Buffer.from(bytes), { headers: { "content-type": artifact.mimeType, "content-disposition": `attachment; filename="yggdrasil-${jobId}-${job.target}.${job.target === "manifest" ? "json" : "zip"}"`, "cache-control": "private, no-store" } });
      } catch { return Response.json({ code: "EXPORT_ARTIFACT_UNAVAILABLE" }, { status: 503 }); }
    },
    async MANIFEST(request: Request, projectId: string, jobId: string): Promise<Response> {
      const response = await this.ARTIFACT(request, projectId, jobId);
      if (response.status !== 200) return response;
      if (response.headers.get("content-type") !== "application/json") return Response.json({ code: "EXPORT_NOT_FOUND" }, { status: 404 });
      return response;
    },
  };
}

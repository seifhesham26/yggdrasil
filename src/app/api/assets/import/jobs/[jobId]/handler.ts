import { parseStorageKey } from "@/lib/storage/storage-key";
import type { ImportJobRecord } from "@/features/assets/infrastructure/import-job-persistence";
import type { VariantReview } from "@/features/assets/application/variant-review";
import { AssetImportError } from "@/features/assets/domain/errors";

type Session = { user: { id: string } } | null;
type JobRepository = {
  get(ownerId: string, jobId: string): Promise<ImportJobRecord | null>;
  retry(ownerId: string, jobId: string): Promise<ImportJobRecord | null>;
  selectVariant(ownerId: string, jobId: string, selectedModelPath: string): Promise<ImportJobRecord | null>;
  requestCancel(ownerId: string, jobId: string): Promise<boolean>;
  markCancelled(ownerId: string, jobId: string): Promise<void>;
};

function present(job: ImportJobRecord) {
  return {
    jobId: job.id, phase: job.phase, assetId: job.assetId, name: job.name,
    nextFile: job.nextFile, fileCount: job.files.length,
    processedBytes: job.processedBytes, totalBytes: job.totalBytes,
    cancelRequested: job.cancelRequested, errorCode: job.errorCode,
    leaseUntil: job.leaseUntil, candidates: job.candidates, selectedModelPath: job.selectedModelPath, updatedAt: job.updatedAt,
  };
}

export function createImportJobHandler(deps: {
  getSession: (headers: Headers) => Promise<Session>;
  jobs: JobRepository;
  removeUpload: (prefix: ReturnType<typeof parseStorageKey>) => Promise<void>;
  reviewJob?: (job: ImportJobRecord) => Promise<VariantReview>;
}) {
  const authenticate = async (request: Request, jobId: string): Promise<{ response: Response; ownerId?: never; job?: never } | { response?: never; ownerId: string; job: ImportJobRecord }> => {
    const session = await deps.getSession(request.headers);
    if (!session) return { response: Response.json({ code: "UNAUTHORIZED" }, { status: 401 }) };
    const job = await deps.jobs.get(session.user.id, jobId);
    if (!job) return { response: Response.json({ code: "NOT_FOUND" }, { status: 404 }) };
    return { ownerId: session.user.id, job };
  };

  return {
    async GET(request: Request, jobId: string): Promise<Response> {
      const found = await authenticate(request, jobId);
      if (found.response) return found.response;
      if (new URL(request.url).searchParams.get("view") === "review" && deps.reviewJob) {
        if (found.job.phase !== "received" && found.job.phase !== "failed") return Response.json({ code: "INVALID_JOB_STATE" }, { status: 409 });
        try { return Response.json(await deps.reviewJob(found.job)); }
        catch (error) { return Response.json({ code: error instanceof AssetImportError ? error.code : "IMPORT_FAILED" }, { status: 400 }); }
      }
      return Response.json(present(found.job));
    },
    async PATCH(request: Request, jobId: string): Promise<Response> {
      const found = await authenticate(request, jobId);
      if (found.response) return found.response;
      let body: unknown;
      try { body = await request.json(); } catch { return Response.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
      const input = body as { action?: unknown; selectedModelPath?: unknown };
      const action = input.action;
      if (action === "retry") {
        const updated = await deps.jobs.retry(found.ownerId, jobId);
        return updated ? Response.json(present(updated)) : Response.json({ code: "INVALID_JOB_STATE" }, { status: 409 });
      }
      if (action === "select-variant") {
        const selectedModelPath = input.selectedModelPath;
        if (typeof selectedModelPath !== "string" || !selectedModelPath) return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
        if (deps.reviewJob) {
          if (found.job.phase !== "received" && found.job.phase !== "failed") return Response.json({ code: "INVALID_JOB_STATE" }, { status: 409 });
          let review: VariantReview;
          try { review = await deps.reviewJob(found.job); }
          catch (error) { return Response.json({ code: error instanceof AssetImportError ? error.code : "IMPORT_FAILED" }, { status: 400 }); }
          const candidate = review.candidates.find((item) => item.modelPath === selectedModelPath);
          if (!candidate || candidate.missingResources.length || candidate.problems.length) return Response.json({ code: candidate ? candidate.problems.length ? "INVALID_FILE" : "MISSING_DEPENDENCY" : "INVALID_JOB_STATE" }, { status: 409 });
        }
        const updated = await deps.jobs.selectVariant(found.ownerId, jobId, selectedModelPath);
        return updated ? Response.json(present(updated)) : Response.json({ code: "INVALID_JOB_STATE" }, { status: 409 });
      }
      if (action === "cancel") {
        const updated = await deps.jobs.requestCancel(found.ownerId, jobId);
        if (!updated) return Response.json({ code: "INVALID_JOB_STATE" }, { status: 409 });
        if (found.job.phase === "received" || found.job.phase === "failed") {
          await deps.jobs.markCancelled(found.ownerId, jobId);
          await deps.removeUpload(parseStorageKey(found.job.uploadPrefix));
        }
        const job = await deps.jobs.get(found.ownerId, jobId);
        return Response.json(job ? present(job) : { code: "NOT_FOUND" }, { status: job ? 200 : 404 });
      }
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    },
  };
}

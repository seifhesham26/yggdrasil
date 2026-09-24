import { AssetImportError } from "@/features/assets/domain/errors";
import type { ImportAssetRequest, ImportAssetResult } from "@/features/assets/application/import-asset";
import { UploadError, type StagedUpload } from "@/features/assets/infrastructure/upload-spool";

type Session = { user: { id: string } } | null;

function errorResponse(status: number, code: string, extras: Record<string, unknown> = {}): Response {
  return Response.json({ code, ...extras }, { status });
}

export function createImportHandler(deps: {
  getSession: (headers: Headers) => Promise<Session>;
  spoolUpload: (request: Request) => Promise<StagedUpload>;
  importAsset: (request: ImportAssetRequest) => Promise<ImportAssetResult>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return errorResponse(401, "UNAUTHORIZED");
    let upload: StagedUpload;
    try {
      upload = await deps.spoolUpload(request);
    } catch (error) {
      if (error instanceof UploadError) {
        const status = error.code === "UPLOAD_TOO_LARGE" || error.code === "TOO_MANY_FILES" ? 413 : 400;
        return errorResponse(status, error.code);
      }
      return errorResponse(500, "IMPORT_FAILED");
    }
    try {
      const first = upload.entries[0].relativePath.split("/").at(-1) ?? "model";
      const name = upload.name ?? first.replace(/\.[^.]+$/, "");
      const result = await deps.importAsset({ ownerId: session.user.id, name, entries: upload.entries });
      return Response.json({ assetId: result.assetId, status: "ready" }, { status: 201 });
    } catch (error) {
      if (error instanceof AssetImportError) {
        const status = error.code === "IMPORT_FAILED" ? 500 : 422;
        const details = error.code === "AMBIGUOUS_PRIMARY_MODEL"
          ? { candidates: error.candidates }
          : error.code === "MISSING_DEPENDENCY"
            ? { message: error.message }
            : {};
        return errorResponse(status, error.code, details);
      }
      return errorResponse(500, "IMPORT_FAILED");
    } finally {
      await upload.cleanup().catch(() => { /* A retained temp tree can be reconciled later. */ });
    }
  };
}

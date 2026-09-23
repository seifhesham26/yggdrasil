import { AssetImportError } from "@/features/assets/domain/errors";
import type { ImportAssetRequest, ImportAssetResult } from "@/features/assets/application/import-asset";

const MAX_UPLOAD_BYTES = 1024 ** 3;
const MAX_FILES = 10_000;
type Session = { user: { id: string } } | null;

function errorResponse(status: number, code: string, extras: Record<string, unknown> = {}): Response {
  return Response.json({ code, ...extras }, { status });
}

function pathsFromForm(form: FormData, count: number): string[] | null {
  const fields = form.getAll("relativePath");
  if (!fields.length) return null;
  if (fields.some((field) => typeof field !== "string")) throw new Error("Invalid relativePath manifest");
  if (fields.length === 1) {
    try {
      const parsed: unknown = JSON.parse(fields[0] as string);
      if (Array.isArray(parsed) && parsed.length === count && parsed.every((path) => typeof path === "string")) return parsed;
    } catch { /* One plain relativePath is also accepted for one file. */ }
  }
  if (fields.length === count) return fields as string[];
  throw new Error("Invalid relativePath manifest");
}

export function createImportHandler(deps: {
  getSession: (headers: Headers) => Promise<Session>;
  importAsset: (request: ImportAssetRequest) => Promise<ImportAssetResult>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return errorResponse(401, "UNAUTHORIZED");
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) return errorResponse(413, "UPLOAD_TOO_LARGE");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse(400, "INVALID_MULTIPART");
    }
    const files = [...form.getAll("file"), ...form.getAll("files")].filter((entry): entry is File => entry instanceof File);
    if (!files.length) return errorResponse(400, "NO_FILES");
    if (files.length > MAX_FILES) return errorResponse(413, "TOO_MANY_FILES");
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_UPLOAD_BYTES) return errorResponse(413, "UPLOAD_TOO_LARGE");
    let paths: string[] | null;
    try {
      paths = pathsFromForm(form, files.length);
    } catch {
      return errorResponse(400, "INVALID_MANIFEST");
    }
    const entries: ImportAssetRequest["entries"] = [];
    for (const [index, file] of files.entries()) {
      entries.push({ relativePath: paths?.[index] ?? file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    const requestedName = form.get("name");
    const name = typeof requestedName === "string" && requestedName.trim() ? requestedName.trim() : files[0].name.replace(/\.[^.]+$/, "");
    try {
      const result = await deps.importAsset({ ownerId: session.user.id, name, entries });
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
    }
  };
}

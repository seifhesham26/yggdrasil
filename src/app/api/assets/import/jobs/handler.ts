import { realpath } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { parseStorageKey } from "@/lib/storage/storage-key";
import type { ImportJobFile } from "@/features/assets/domain/types";
import { UploadError, type StagedUpload } from "@/features/assets/infrastructure/upload-spool";

type CreateJob = (input: { ownerId: string; name: string; uploadPrefix: string; files: ImportJobFile[]; totalBytes: number }) => Promise<{ id: string; phase: string }>;

export function createImportJobUploadHandler(deps: {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  spoolUpload: (request: Request) => Promise<StagedUpload>;
  createJob: CreateJob;
  storageRoot: string;
}) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    let upload: StagedUpload;
    try {
      upload = await deps.spoolUpload(request);
    } catch (error) {
      if (error instanceof UploadError) return Response.json({ code: error.code }, { status: error.code === "UPLOAD_TOO_LARGE" || error.code === "TOO_MANY_FILES" ? 413 : 400 });
      return Response.json({ code: "IMPORT_FAILED" }, { status: 500 });
    }
    try {
      const root = await realpath(deps.storageRoot);
      const uploadPrefix = parseStorageKey(relative(root, dirname(upload.entries[0].path)).split(sep).join("/"));
      if (!uploadPrefix.startsWith("staging/upload-")) throw new Error("Upload escaped staging storage");
      const files: ImportJobFile[] = upload.entries.map((entry) => {
        const storageKey = parseStorageKey(relative(root, entry.path).split(sep).join("/"));
        if (!storageKey.startsWith(`${uploadPrefix}/`)) throw new Error("Upload file escaped its staging tree");
        return { relativePath: entry.relativePath, storageKey, byteSize: entry.byteSize, sha256: entry.sha256 };
      });
      const first = files[0].relativePath.split("/").at(-1) ?? "model";
      const job = await deps.createJob({
        ownerId: session.user.id, name: upload.name ?? first.replace(/\.[^.]+$/, ""), uploadPrefix,
        files, totalBytes: files.reduce((total, file) => total + file.byteSize, 0),
      });
      return Response.json({ jobId: job.id, phase: job.phase }, { status: 202 });
    } catch {
      await upload.cleanup();
      return Response.json({ code: "IMPORT_FAILED" }, { status: 500 });
    }
  };
}

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";

type UploadCode = "UPLOAD_TOO_LARGE" | "TOO_MANY_FILES" | "INVALID_MULTIPART" | "INVALID_MANIFEST" | "NO_FILES";

export class UploadError extends Error {
  constructor(public readonly code: UploadCode, message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type StagedUploadFile = { relativePath: string; path: string; byteSize: number; sha256: string };
export type StagedUpload = { entries: StagedUploadFile[]; name?: string; cleanup: () => Promise<void> };

export type UploadLimits = {
  maxUploadBytes: number;
  maxFileBytes: number;
  maxFiles: number;
  maxFieldBytes: number;
};

const defaults: UploadLimits = {
  maxUploadBytes: 1024 ** 3,
  maxFileBytes: 1024 ** 3,
  maxFiles: 10_000,
  maxFieldBytes: 1024 ** 2,
};

function relativePaths(fields: string[], count: number): string[] | null {
  if (!fields.length) return null;
  if (fields.length === 1 && fields[0].startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(fields[0]);
      if (Array.isArray(parsed) && parsed.length === count && parsed.every((path) => typeof path === "string")) return parsed;
    } catch { /* Report the same manifest error as a parsed array with the wrong count. */ }
    throw new UploadError("INVALID_MANIFEST", "Relative paths do not match uploaded files");
  }
  if (fields.length === count) return fields;
  throw new UploadError("INVALID_MANIFEST", "Relative paths do not match uploaded files");
}

/** Receives multipart bytes into private, random temporary files. No file body is held in memory. */
export async function spoolImportUpload(request: Request, storageRoot: string, overrides: Partial<UploadLimits> = {}): Promise<StagedUpload> {
  if (!isAbsolute(storageRoot)) throw new Error("Upload storage root must be absolute");
  if (request.signal.aborted) throw new UploadError("INVALID_MULTIPART", "Upload was interrupted");
  const limits = { ...defaults, ...overrides };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limits.maxUploadBytes) throw new UploadError("UPLOAD_TOO_LARGE", "Upload exceeds the byte limit");
  if (!request.body) throw new UploadError("INVALID_MULTIPART", "Upload body is missing");
  const type = request.headers.get("content-type");
  if (!type?.toLowerCase().startsWith("multipart/form-data;")) throw new UploadError("INVALID_MULTIPART", "Expected multipart form data");

  const stagingRoot = join(await realpath(storageRoot), "staging");
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  if ((await lstat(stagingRoot)).isSymbolicLink()) throw new Error("Upload staging path must not be a symlink");
  const directory = await mkdtemp(join(stagingRoot, "upload-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  const entries: StagedUploadFile[] = [];
  const paths: string[] = [];
  const writes: Promise<void>[] = [];
  let requestedName: string | undefined;
  let received = 0;
  let failure: Error | undefined;
  try {
    const parser = Busboy({
      headers: { "content-type": type },
      preservePath: false,
      limits: { fileSize: limits.maxFileBytes, files: limits.maxFiles, fields: limits.maxFiles + 1, fieldSize: limits.maxFieldBytes, parts: limits.maxFiles * 2 + 1 },
    });
    const abort = (error: Error) => { failure ??= error; parser.destroy(error); };
    parser.on("filesLimit", () => abort(new UploadError("TOO_MANY_FILES", "Upload contains too many files")));
    parser.on("fieldsLimit", () => abort(new UploadError("INVALID_MANIFEST", "Upload contains too many fields")));
    parser.on("partsLimit", () => abort(new UploadError("INVALID_MANIFEST", "Upload contains too many parts")));
    parser.on("field", (field, value, info) => {
      if (info.nameTruncated || info.valueTruncated) return abort(new UploadError("INVALID_MANIFEST", "Upload field exceeds its limit"));
      if (field === "relativePath") paths.push(value);
      else if (field === "name") requestedName = value;
      else abort(new UploadError("INVALID_MANIFEST", `Unexpected upload field: ${field}`));
    });
    parser.on("file", (field, input, info) => {
      if (field !== "file" && field !== "files") return abort(new UploadError("INVALID_MANIFEST", `Unexpected upload file field: ${field}`));
      const index = entries.length;
      const path = join(directory, `${index}.part`);
      const hash = createHash("sha256");
      let byteSize = 0;
      entries.push({ relativePath: info.filename, path, byteSize: 0, sha256: "" });
      input.on("limit", () => abort(new UploadError("UPLOAD_TOO_LARGE", `File exceeds the byte limit: ${info.filename}`)));
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          byteSize += chunk.byteLength;
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      writes.push(pipeline(input, meter, createWriteStream(path, { flags: "wx", mode: 0o600 })).then(() => {
        entries[index].byteSize = byteSize;
        entries[index].sha256 = hash.digest("hex");
      }).catch((error: unknown) => {
        abort(error instanceof Error ? error : new Error("Upload write failed"));
      }));
    });
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        callback(received > limits.maxUploadBytes ? new UploadError("UPLOAD_TOO_LARGE", "Upload exceeds the byte limit") : null, chunk);
      },
    });
    const source = Readable.fromWeb(request.body as never);
    const onAbort = () => source.destroy(new UploadError("INVALID_MULTIPART", "Upload was interrupted"));
    request.signal.addEventListener("abort", onAbort, { once: true });
    try {
      await pipeline(source, meter, parser);
      await Promise.all(writes);
      if (failure) throw failure;
    } finally {
      request.signal.removeEventListener("abort", onAbort);
    }
    if (!entries.length) throw new UploadError("NO_FILES", "Upload contains no files");
    const manifest = relativePaths(paths, entries.length);
    entries.forEach((entry, index) => { entry.relativePath = manifest?.[index] ?? entry.relativePath; });
    return { entries, name: requestedName?.trim() || undefined, cleanup };
  } catch (error) {
    await Promise.allSettled(writes);
    await cleanup();
    if (error instanceof UploadError) throw error;
    if (failure instanceof UploadError) throw failure;
    throw new UploadError("INVALID_MULTIPART", "Upload could not be read");
  }
}

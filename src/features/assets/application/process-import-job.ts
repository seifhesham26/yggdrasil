import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { AssetImportError } from "../domain/errors";
import type { ImportJobFile, ImportSource } from "../domain/types";
import type { ImportAssetRequest, ImportAssetResult } from "./import-asset";

type Job = {
  id: string; ownerId: string; name: string; phase: string; uploadPrefix: string;
  files: ImportJobFile[]; totalBytes: number; cancelRequested: boolean;
};

type Jobs = {
  claim(ownerId: string, jobId: string): Promise<Job | null>;
  get(ownerId: string, jobId: string): Promise<Job | null>;
  progress(ownerId: string, jobId: string, checkpoint: { phase: "staging" | "analyzing" | "committing"; nextFile: number; processedBytes: number; totalBytes: number }): Promise<void>;
  heartbeat(ownerId: string, jobId: string): Promise<void>;
  complete(ownerId: string, jobId: string, assetId: string): Promise<void>;
  fail(ownerId: string, jobId: string, errorCode: string): Promise<void>;
  markCancelled(ownerId: string, jobId: string): Promise<void>;
};

async function verifyFile(path: string, file: ImportJobFile): Promise<void> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    hash.update(chunk);
  }
  if (size !== file.byteSize || hash.digest("hex") !== file.sha256) {
    throw new AssetImportError("IMPORT_FAILED", `Uploaded file changed: ${file.relativePath}`);
  }
}

export function createProcessImportJob(deps: {
  storage: LocalAssetStorage;
  jobs: Jobs;
  importAsset: (request: ImportAssetRequest, hooks: {
    reportProgress: (progress: { phase: "staging" | "analyzing" | "committing"; nextFile: number; processedBytes: number; totalBytes: number }) => Promise<void>;
    isCancelled: () => Promise<boolean>;
  }) => Promise<Pick<ImportAssetResult, "assetId">>;
}) {
  return async function process(ownerId: string, jobId: string): Promise<{ phase: "completed"; assetId: string } | { phase: "failed"; errorCode: string } | { phase: "cancelled" } | null> {
    const job = await deps.jobs.claim(ownerId, jobId);
    if (!job) return null;
    let heartbeatError: unknown;
    const timer = setInterval(() => {
      void deps.jobs.heartbeat(ownerId, jobId).catch((error: unknown) => { heartbeatError ??= error; });
    }, 5_000);
    timer.unref();
    try {
      const prefix = parseStorageKey(job.uploadPrefix);
      if (!prefix.startsWith("staging/upload-")) throw new Error("Invalid upload prefix");
      const entries: ImportSource[] = [];
      for (const file of job.files) {
        const key = parseStorageKey(file.storageKey);
        if (!key.startsWith(`${prefix}/`)) throw new Error("Upload file escapes job prefix");
        const path = deps.storage.processingPath(key);
        await verifyFile(path, file);
        entries.push({ relativePath: file.relativePath, path, byteSize: file.byteSize, sha256: file.sha256 });
      }
      const result = await deps.importAsset({ ownerId, name: job.name, assetId: job.id, entries }, {
        reportProgress: (progress) => deps.jobs.progress(ownerId, jobId, progress),
        isCancelled: async () => {
          if (heartbeatError) throw heartbeatError;
          return (await deps.jobs.get(ownerId, jobId))?.cancelRequested ?? true;
        },
      });
      if (heartbeatError) throw heartbeatError;
      await deps.jobs.complete(ownerId, jobId, result.assetId);
      await deps.storage.removeTree(prefix);
      return { phase: "completed", assetId: result.assetId };
    } catch (error) {
      const code = error instanceof AssetImportError ? error.code : "IMPORT_FAILED";
      if (code === "IMPORT_CANCELLED" || (await deps.jobs.get(ownerId, jobId))?.cancelRequested) {
        await deps.jobs.markCancelled(ownerId, jobId);
        await deps.storage.removeTree(parseStorageKey(job.uploadPrefix));
        return { phase: "cancelled" };
      }
      await deps.jobs.fail(ownerId, jobId, code);
      return { phase: "failed", errorCode: code };
    } finally {
      clearInterval(timer);
    }
  };
}

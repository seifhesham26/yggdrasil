import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createProcessImportJob } from "./process-import-job";

const ownerId = "owner";
const jobId = "5d5824ee-321b-4fa5-af42-91439c817ccd";
const bytes = Buffer.from("model bytes");
let root: string;

afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("process import job", () => {
  it("claims a saved upload, reports progress and completes the same asset", async () => {
    root = await mkdtemp(join(tmpdir(), "yggdrasil-job-"));
    const uploadPrefix = "staging/upload-test";
    const storage = new LocalAssetStorage(root);
    await mkdir(join(root, uploadPrefix), { recursive: true });
    await writeFile(storage.processingPath(parseStorageKey(`${uploadPrefix}/0.part`)), bytes);
    const job = {
      id: jobId, ownerId, name: "test", phase: "staging", uploadPrefix,
      files: [{ relativePath: "model.glb", storageKey: `${uploadPrefix}/0.part`, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
      totalBytes: bytes.length, cancelRequested: false,
    };
    const progress = vi.fn(async () => {});
    const complete = vi.fn(async () => {});
    const importAsset = vi.fn(async (input: { assetId?: string; entries: unknown[] }) => {
      expect(input.assetId).toBe(jobId);
      expect(input.entries).toHaveLength(1);
      return { assetId: jobId };
    });
    const process = createProcessImportJob({
      storage,
      jobs: { claim: async () => job, get: async () => job, progress, heartbeat: async () => {}, complete, fail: async () => {}, markCancelled: async () => {} },
      importAsset,
    });
    expect(await process(ownerId, jobId)).toEqual({ phase: "completed", assetId: jobId });
    expect(complete).toHaveBeenCalledWith(ownerId, jobId, jobId);
    expect(await storage.exists(parseStorageKey(`${uploadPrefix}/0.part`))).toBe(false);
  });

  it("fails a changed upload without deleting it so recovery can inspect it", async () => {
    root = await mkdtemp(join(tmpdir(), "yggdrasil-job-"));
    const storage = new LocalAssetStorage(root);
    const uploadPrefix = "staging/upload-test";
    await mkdir(join(root, uploadPrefix), { recursive: true });
    await writeFile(join(root, uploadPrefix, "0.part"), Buffer.from("changed"));
    const job = {
      id: jobId, ownerId, name: "test", phase: "staging", uploadPrefix,
      files: [{ relativePath: "model.glb", storageKey: `${uploadPrefix}/0.part`, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
      totalBytes: bytes.length, cancelRequested: false,
    };
    const fail = vi.fn(async () => {});
    const importAsset = vi.fn();
    const process = createProcessImportJob({ storage, jobs: { claim: async () => job, get: async () => job, progress: async () => {}, heartbeat: async () => {}, complete: async () => {}, fail, markCancelled: async () => {} }, importAsset });
    expect(await process(ownerId, jobId)).toEqual({ phase: "failed", errorCode: "IMPORT_FAILED" });
    expect(fail).toHaveBeenCalled();
    expect(importAsset).not.toHaveBeenCalled();
    expect(await storage.exists(parseStorageKey(`${uploadPrefix}/0.part`))).toBe(true);
  });
});

// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import type { AssetStorage } from "@/lib/storage/types";
import type { StorageKey } from "@/lib/storage/storage-key";
import type { AssetAnalysis, ImportFile, ImportManifest, ImportSource } from "../domain/types";
import type { AssetRepository, CompleteImportRecord } from "../infrastructure/asset-repository";
import { createImportAsset } from "./import-asset";
import { buildImportManifest } from "../infrastructure/import-manifest";

const assetId = "ab2a5b66-a3c2-47de-87ca-9809d9db8f81";
const sourceId = "1bb5771e-9537-4d27-a61b-d1180d41351d";
const analysis: AssetAnalysis = {
  format: "gltf",
  counts: { scenes: 1, nodes: 1, meshes: 1, primitives: 1, vertices: 3, triangles: 1, materials: 1, textures: 0, skins: 0, morphTargets: 0, cameras: 0, lights: 0, animations: 1 },
  bounds: { min: [0, 0, 0], max: [1, 1, 0] },
  animations: [{ name: "Rise", durationSeconds: 1, channels: 1 }],
  nodeNames: ["Triangle"], extensionsUsed: [], warnings: [],
};
const model: ImportFile = { relativePath: "folder/triangle.gltf", bytes: new TextEncoder().encode('{"asset":{"version":"2.0"}}') };
const binary: ImportFile = { relativePath: "folder/triangle.bin", bytes: new Uint8Array([1, 2, 3, 4]) };

function fakes() {
  const events: string[] = [];
  const files = new Map<string, Uint8Array>();
  let completeInput: CompleteImportRecord | undefined;
  let failure: { assetId: string; ownerId: string; code: string } | undefined;
  const storage: AssetStorage = {
    async put(key, bytes) { events.push(`put:${key}`); files.set(key, new Uint8Array(bytes)); },
    async putFile(key, path) { events.push(`putFile:${key}`); files.set(key, new Uint8Array(await readFile(path))); },
    async read(key) { const value = files.get(key); if (!value) throw new Error("missing"); return value; },
    async exists(key) { return files.has(key); },
    async removeTree(prefix) { events.push(`remove:${prefix}`); for (const key of files.keys()) if (key.startsWith(`${prefix}/`)) files.delete(key); },
    async commitTree(staged, final) {
      events.push(`commit:${staged}:${final}`);
      for (const [key, bytes] of [...files]) if (key.startsWith(`${staged}/`)) {
        files.set(`${final}/${key.slice(staged.length + 1)}`, bytes);
        files.delete(key);
      }
    },
    processingPath(key: StorageKey) { return key; },
  };
  const repository: AssetRepository = {
    async createImport(input) { events.push(`create:${input.ownerId}`); return { assetId, sourceId }; },
    async completeImport(input) { events.push("complete"); completeInput = input; },
    async failImport(id, ownerId, code) { events.push("fail"); failure = { assetId: id, ownerId, code }; },
    async getAsset() { return null; },
    async listAssets() { return []; },
  };
  const manifest: ImportManifest = { primaryModel: model, dependencies: [binary], attributionFiles: [], thumbnails: [], warnings: [] };
  const buildManifest = vi.fn(async (_entries: ImportSource[]): Promise<ImportManifest<ImportSource>> => manifest);
  const analyze = vi.fn(async (_storage: AssetStorage, key: StorageKey) => {
    events.push(`analyze:${key}`);
    expect(files.has("staging/import-1/folder/triangle.gltf")).toBe(true);
    expect(files.has("staging/import-1/folder/triangle.bin")).toBe(true);
    return analysis;
  });
  return { events, files, storage, repository, buildManifest, analyze, getComplete: () => completeInput, getFailure: () => failure };
}

describe("createImportAsset", () => {
  it("finishes the same asset after a process stops just after source-tree promotion", async () => {
    const deps = fakes();
    deps.files.set(`assets/${assetId}/source/${model.relativePath}`, new Uint8Array(model.bytes));
    deps.files.set(`assets/${assetId}/source/${binary.relativePath}`, new Uint8Array(binary.bytes));
    deps.analyze.mockImplementationOnce(async (_storage, key) => {
      expect(key).toBe(`assets/${assetId}/source/${model.relativePath}`);
      return analysis;
    });
    const importAsset = createImportAsset({ ...deps, createId: () => "unused" });
    const result = await importAsset({ ownerId: "owner-1", name: "Triangle", assetId, entries: [model, binary] });
    expect(result.assetId).toBe(assetId);
    expect(deps.getComplete()?.files).toHaveLength(2);
    expect(deps.events).not.toContainEqual(expect.stringMatching(/^put:|^commit:/));
    expect(deps.files.get(`assets/${assetId}/source/${model.relativePath}`)).toEqual(model.bytes);
  });

  it("returns an already completed job asset without staging another copy", async () => {
    const deps = fakes();
    deps.repository.getAsset = async () => ({
      id: assetId, ownerId: "owner-1", name: "Triangle", status: "ready", errorCode: null,
      createdAt: new Date(), updatedAt: new Date(), byteSize: model.bytes.length,
      format: "glTF", counts: { meshes: 1, triangles: 1, animations: 1 }, files: [], analysis,
    });
    const importAsset = createImportAsset({ ...deps, createId: () => "unused" });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", assetId, entries: [model] })).resolves.toMatchObject({ assetId, analysis });
    expect(deps.events).not.toContainEqual(expect.stringMatching(/^put:|^commit:|^complete$/));
  });

  it("reports staged bytes and stops before promotion when cancellation is requested", async () => {
    const deps = fakes();
    const progress = vi.fn(async () => {});
    let checks = 0;
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1", reportProgress: progress, isCancelled: async () => ++checks >= 4 });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] })).rejects.toMatchObject({ code: "IMPORT_CANCELLED" });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: "staging", processedBytes: model.bytes.length, totalBytes: model.bytes.length + binary.bytes.length }));
    expect(deps.events).not.toContainEqual(expect.stringMatching(/^commit:/));
    expect(deps.files.size).toBe(0);
  });
  it("imports file-backed sources without replacing their original bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-file-import-test-"));
    try {
      const path = join(root, "model.part");
      await writeFile(path, model.bytes);
      const source = { relativePath: model.relativePath, path, byteSize: model.bytes.length, sha256: createHash("sha256").update(model.bytes).digest("hex") };
      const deps = fakes();
      deps.analyze.mockResolvedValueOnce(analysis);
      const importAsset = createImportAsset({ ...deps, buildManifest: buildImportManifest, createId: () => "import-1" });
      await importAsset({ ownerId: "owner-1", name: "Triangle", entries: [source] });
      expect(deps.events).toContain(`putFile:staging/import-1/${model.relativePath}`);
      expect(deps.getComplete()?.files).toContainEqual(expect.objectContaining({ sha256: source.sha256, byteSize: source.byteSize }));
      expect(await readFile(path)).toEqual(Buffer.from(model.bytes));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("stores an uploaded ZIP byte-for-byte with its extracted source files and hash", async () => {
    const deps = fakes();
    const archive: ImportFile = { relativePath: "bundle.zip", bytes: zipSync({ "folder/triangle.gltf": model.bytes, "folder/triangle.bin": binary.bytes }) };
    const original = new Uint8Array(archive.bytes);
    const importAsset = createImportAsset({ ...deps, buildManifest: buildImportManifest, createId: () => "import-1" });

    await importAsset({ ownerId: "owner-1", name: "Triangle", entries: [archive] });

    const stored = deps.files.get(`assets/${assetId}/source/bundle.zip`);
    expect(stored).toEqual(original);
    expect(archive.bytes).toEqual(original);
    expect(deps.getComplete()?.files).toContainEqual(expect.objectContaining({
      relativePath: "bundle.zip", storageKey: `assets/${assetId}/source/bundle.zip`,
      byteSize: original.byteLength, sha256: createHash("sha256").update(original).digest("hex"),
      mimeType: "application/zip", role: "source",
    }));
    expect(deps.files.get(`assets/${assetId}/source/folder/triangle.gltf`)).toEqual(model.bytes);
  });

  it("stores an OBJ source beside a normalized GLB and analyzes the normalized file", async () => {
    const deps = fakes();
    const obj: ImportFile = { relativePath: "folder/triangle.obj", bytes: new TextEncoder().encode("v 0 0 0\n") };
    deps.buildManifest.mockResolvedValueOnce({ primaryModel: obj, dependencies: [], attributionFiles: [], thumbnails: [], warnings: [] });
    deps.analyze.mockImplementationOnce(async (_storage, key) => {
      expect(key).toBe("staging/import-1/__normalized/folder/triangle.glb");
      return analysis;
    });
    const convert = vi.fn(async () => ({ bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]), warnings: [{ code: "FBX_FIDELITY_LIMITS", message: "warning" }] }));
    const importAsset = createImportAsset({ ...deps, convert, createId: () => "import-1" });
    await importAsset({ ownerId: "owner-1", name: "Triangle", entries: [obj] });
    expect(convert).toHaveBeenCalledWith(expect.objectContaining({ format: "obj", relativePath: "folder/triangle.obj" }));
    expect(deps.events).toContain("put:staging/import-1/__normalized/folder/triangle.glb");
    expect(deps.getComplete()?.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "folder/triangle.obj", role: "source" }),
      expect.objectContaining({ relativePath: "__normalized/folder/triangle.glb", role: "model" }),
    ]));
  });

  it("stages sources, analyzes, commits, and persists all file hashes and sizes", async () => {
    const deps = fakes();
    const originalModel = new Uint8Array(model.bytes);
    const originalBinary = new Uint8Array(binary.bytes);
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1" });
    const result = await importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] });
    expect(result).toMatchObject({ assetId, sourceId, analysis });
    expect(deps.events).toEqual([
      "create:owner-1", "put:staging/import-1/folder/triangle.gltf", "put:staging/import-1/folder/triangle.bin",
      "analyze:staging/import-1/folder/triangle.gltf",
      `commit:staging/import-1:assets/${assetId}/source`, "complete",
    ]);
    expect(deps.getComplete()?.files).toEqual([
      expect.objectContaining({ relativePath: model.relativePath, storageKey: `assets/${assetId}/source/${model.relativePath}`, byteSize: model.bytes.length, sha256: createHash("sha256").update(model.bytes).digest("hex"), role: "model" }),
      expect.objectContaining({ relativePath: binary.relativePath, storageKey: `assets/${assetId}/source/${binary.relativePath}`, byteSize: binary.bytes.length, sha256: createHash("sha256").update(binary.bytes).digest("hex"), role: "dependency" }),
    ]);
    expect(deps.getComplete()?.ownerId).toBe("owner-1");
    expect(model.bytes).toEqual(originalModel);
    expect(binary.bytes).toEqual(originalBinary);
    expect(deps.files.has(`assets/${assetId}/source/folder/triangle.gltf`)).toBe(true);
  });

  it("removes only its staged tree and marks the import failed when analysis fails", async () => {
    const deps = fakes();
    deps.analyze.mockImplementationOnce(async () => { throw new Error("private parser details"); });
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1" });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] })).rejects.toMatchObject({ code: "IMPORT_FAILED" });
    expect(deps.events).toContain("remove:staging/import-1");
    expect(deps.events).toContain("fail");
    expect(deps.getFailure()).toEqual({ assetId, ownerId: "owner-1", code: "IMPORT_FAILED" });
    expect(deps.files.size).toBe(0);
  });

  it("removes committed files if the completion transaction fails", async () => {
    const deps = fakes();
    deps.repository.completeImport = async () => { throw new Error("database offline"); };
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1" });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] })).rejects.toMatchObject({ code: "IMPORT_FAILED" });
    expect(deps.events).toContain(`remove:assets/${assetId}/source`);
    expect(deps.getFailure()?.code).toBe("IMPORT_FAILED");
    expect(deps.files.size).toBe(0);
  });

  it("cleans up a partial staging write", async () => {
    const deps = fakes();
    const originalPut = deps.storage.put;
    let writes = 0;
    deps.storage.put = async (key, bytes) => {
      if (++writes === 2) throw new Error("disk full");
      await originalPut(key, bytes);
    };
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1" });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] })).rejects.toMatchObject({ code: "IMPORT_FAILED" });
    expect(deps.files.size).toBe(0);
    expect(deps.getFailure()?.code).toBe("IMPORT_FAILED");
  });

  it("keeps committed files if a lost response follows a completed database transaction", async () => {
    const deps = fakes();
    deps.repository.completeImport = async () => { throw new Error("response lost"); };
    deps.repository.getAsset = async () => ({
      id: assetId, ownerId: "owner-1", name: "Triangle", status: "ready", errorCode: null,
      createdAt: new Date(), updatedAt: new Date(), byteSize: model.bytes.length + binary.bytes.length,
      format: "glTF", counts: { meshes: 1, triangles: 1, animations: 1 }, files: [], analysis,
    });
    const importAsset = createImportAsset({ ...deps, createId: () => "import-1" });
    await expect(importAsset({ ownerId: "owner-1", name: "Triangle", entries: [model, binary] })).resolves.toMatchObject({ assetId, analysis });
    expect(deps.files.has(`assets/${assetId}/source/folder/triangle.gltf`)).toBe(true);
    expect(deps.events).not.toContain("fail");
  });
});

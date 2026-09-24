// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";
import { createFileHandler } from "./handler";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-route-"));
  roots.push(root);
  const storage = new LocalAssetStorage(root);
  const key = parseStorageKey("assets/asset-1/source/hero.glb");
  const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
  await storage.put(key, bytes);
  const asset: AssetDetail = {
    id: "asset-1", ownerId: "owner", name: "Hero", status: "ready", errorCode: null, createdAt: new Date(), updatedAt: new Date(), byteSize: bytes.length, format: "GLB", counts: null, analysis: null,
    files: [{ relativePath: "hero.glb", storageKey: key, byteSize: bytes.length, sha256: "hash", mimeType: "model/gltf-binary", role: "model" }],
  };
  return { storage, key, bytes, asset };
}

function url(key: string) { return `http://localhost/api/assets/asset-1/file?key=${encodeURIComponent(key)}`; }
const params = { params: Promise.resolve({ assetId: "asset-1" }) };

describe("GET /api/assets/:assetId/file", () => {
  it("returns 401 without a session", async () => {
    const { storage, key, asset } = await fixture();
    const handler = createFileHandler({ getSession: async () => null, getAsset: async () => asset, storage });
    expect((await handler(new Request(url(key)), params)).status).toBe(401);
  });

  it("returns 404 if the key does not belong to the owner's asset", async () => {
    const { storage, asset } = await fixture();
    const handler = createFileHandler({ getSession: async () => ({ user: { id: "owner" } }), getAsset: async () => asset, storage });
    expect((await handler(new Request(url("assets/other/source/secret.glb")), params)).status).toBe(404);
  });

  it("streams a private GLB with nosniff and byte ranges", async () => {
    const { storage, key, bytes, asset } = await fixture();
    const handler = createFileHandler({ getSession: async () => ({ user: { id: "owner" } }), getAsset: async () => asset, storage });
    const full = await handler(new Request(url(key)), params);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("model/gltf-binary");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(full.headers.get("cache-control")).toMatch(/private/);
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);
    const partial = await handler(new Request(url(key), { headers: { range: "bytes=0-3" } }), params);
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 0-3/8");
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(bytes.slice(0, 4));
    const invalid = await handler(new Request(url(key), { headers: { range: "bytes=100-200" } }), params);
    expect(invalid.status).toBe(416);
  });

  it("streams a retained source ZIP only through the owning asset", async () => {
    const { storage, asset } = await fixture();
    const key = parseStorageKey("assets/asset-1/source/bundle.zip");
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await storage.put(key, bytes);
    asset.files.push({ relativePath: "bundle.zip", storageKey: key, byteSize: bytes.length, sha256: "hash", mimeType: "application/zip", role: "source" });
    const handler = createFileHandler({
      getSession: async (headers) => ({ user: { id: headers.get("x-test-owner") ?? "owner" } }),
      getAsset: async (_id, ownerId) => ownerId === asset.ownerId ? asset : null,
      storage,
    });

    const owner = await handler(new Request(url(key)), params);
    expect(owner.status).toBe(200);
    expect(owner.headers.get("content-type")).toBe("application/zip");
    expect(new Uint8Array(await owner.arrayBuffer())).toEqual(bytes);
    const other = await handler(new Request(url(key), { headers: { "x-test-owner": "other" } }), params);
    expect(other.status).toBe(404);
  });
});

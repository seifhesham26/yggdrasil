// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeGltf } from "../infrastructure/gltf-analyzer";
import { ReversibleOptimizationHistory } from "./reversible-optimization";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-history-")); roots.push(root); const storage = new LocalAssetStorage(root); const data = createGltfFixture();
  await storage.put(parseStorageKey("assets/a/source/triangle.gltf"), data.model.bytes); await storage.put(parseStorageKey("assets/a/source/triangle.bin"), data.binary.bytes);
  const analysis = await analyzeGltf(storage, parseStorageKey("assets/a/source/triangle.gltf")); const history = new ReversibleOptimizationHistory(storage, analyzeGltf, () => `id-${Math.random()}`);
  history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: data.model.bytes.byteLength, analysis });
  return { history, storage, analysis };
}

describe("ReversibleOptimizationHistory", () => {
  it("requires approval, creates lineage, measures output, and reverts without deleting history", async () => {
    const { history } = await fixture();
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: false })).rejects.toThrow("approval");
    const derived = await history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true });
    expect(derived.parentVersionId).toBe("original"); expect(derived.byteSize).toBeGreaterThan(0); expect(history.list("owner-1", "a")).toHaveLength(2);
    history.revert("owner-1", "a", "original"); expect(history.currentVersion("owner-1", "a")?.id).toBe("original"); expect(history.list("owner-1", "a")).toHaveLength(2);
  });

  it("keeps the previous version current and records a failed attempt", async () => {
    const { history } = await fixture();
    await expect(history.apply({ ownerId: "owner-2", assetId: "a", operation: "normalize", approve: true })).rejects.toThrow("owner");
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "compress-geometry", approve: true })).rejects.toThrow("Unsupported");
    expect(history.currentVersion("owner-1", "a")?.id).toBe("original"); expect(history.attemptsFor("owner-1", "a")).toEqual(expect.arrayContaining([expect.objectContaining({ status: "failed" })]));
  });
});

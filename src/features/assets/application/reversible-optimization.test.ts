// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeGltf } from "../infrastructure/gltf-analyzer";
import { InMemoryOptimizationPersistence, ReversibleOptimizationHistory } from "./reversible-optimization";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-history-")); roots.push(root); const storage = new LocalAssetStorage(root); const data = createGltfFixture();
  await storage.put(parseStorageKey("assets/a/source/triangle.gltf"), data.model.bytes); await storage.put(parseStorageKey("assets/a/source/triangle.bin"), data.binary.bytes);
  const analysis = await analyzeGltf(storage, parseStorageKey("assets/a/source/triangle.gltf")); const history = new ReversibleOptimizationHistory(storage, analyzeGltf, () => `id-${Math.random()}`);
  await history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: data.model.bytes.byteLength, analysis });
  return { history, storage, analysis };
}

describe("ReversibleOptimizationHistory", () => {
  it("waits for initial persistence before publishing a current selection", async () => {
    const { storage, analysis } = await fixture();
    const persistence = new InMemoryOptimizationPersistence();
    let finish!: () => void;
    vi.spyOn(persistence, "setCurrent").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, undefined, persistence);
    let settled = false;
    const pending = Promise.resolve(history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: 1, analysis })).then(() => { settled = true; });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(settled).toBe(false);
    expect(history.currentVersion("owner-1", "a")).toBeUndefined();
    finish();
    await pending;
    expect(history.currentVersion("owner-1", "a")?.id).toBe("original");
  });

  it("keeps the previous current selection when a revert save fails", async () => {
    const { storage, analysis } = await fixture();
    const persistence = new InMemoryOptimizationPersistence();
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, () => `id-${Math.random()}`, persistence);
    await history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: 1, analysis });
    const derived = await history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true });
    vi.spyOn(persistence, "setCurrent").mockImplementation(() => { throw new Error("save unavailable"); });
    await expect(Promise.resolve().then(() => history.revert("owner-1", "a", "original"))).rejects.toThrow("save unavailable");
    expect(history.currentVersion("owner-1", "a")?.id).toBe(derived.id);
  });

  it("retries the recorded parent and settings after selection changes and reload", async () => {
    const { storage, analysis } = await fixture();
    const persistence = new InMemoryOptimizationPersistence();
    let fail = false;
    const history = new ReversibleOptimizationHistory(storage, async (...args) => {
      if (fail) throw new Error("temporary analyzer failure");
      return analyzeGltf(...args);
    }, () => `id-${Math.random()}`, persistence);
    await history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: 1, analysis });
    const parent = await history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true });
    fail = true;
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "remove-unused", approve: true, settings: { keepExtras: false } })).rejects.toThrow();
    const failed = history.attemptsFor("owner-1", "a").at(-1)!;
    await history.revert("owner-1", "a", "original");
    const reopened = new ReversibleOptimizationHistory(storage, analyzeGltf, () => `id-${Math.random()}`, persistence);
    await reopened.reload("owner-1", "a");
    const retried = await reopened.retry("owner-1", "a");
    expect(retried.parentVersionId).toBe(parent.id);
    expect(reopened.attemptsFor("owner-1", "a").at(-1)).toMatchObject({ retryOf: failed.id, settings: { keepExtras: false } });
    await reopened.reload("owner-1", "a");
    expect(reopened.attemptsFor("owner-1", "a")).toHaveLength(3);
  });

  it("requires approval, creates lineage, measures output, and reverts without deleting history", async () => {
    const { history } = await fixture();
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: false })).rejects.toThrow("approval");
    const derived = await history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true });
    expect(derived.parentVersionId).toBe("original"); expect(derived.byteSize).toBeGreaterThan(0); expect(history.list("owner-1", "a")).toHaveLength(2);
    await history.revert("owner-1", "a", "original"); expect(history.currentVersion("owner-1", "a")?.id).toBe("original"); expect(history.list("owner-1", "a")).toHaveLength(2);
  });

  it("keeps the previous version current and records a failed attempt", async () => {
    const { history } = await fixture();
    await expect(history.apply({ ownerId: "owner-2", assetId: "a", operation: "normalize", approve: true })).rejects.toThrow("owner");
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "compress-geometry", approve: true })).rejects.toThrow("Unsupported");
    expect(history.currentVersion("owner-1", "a")?.id).toBe("original"); expect(history.attemptsFor("owner-1", "a")).toEqual(expect.arrayContaining([expect.objectContaining({ status: "failed" })]));
  });

  it("reloads persisted lineage and current selection in a fresh history instance", async () => {
    const { storage, analysis } = await fixture();
    const persistence = new InMemoryOptimizationPersistence();
    const first = new ReversibleOptimizationHistory(storage, analyzeGltf, () => `id-${Math.random()}`, persistence);
    await first.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: 1, analysis });
    const derived = await first.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true });
    await first.revert("owner-1", "a", "original");
    const reopened = new ReversibleOptimizationHistory(storage, analyzeGltf, () => "unused", persistence);
    await reopened.reload("owner-1", "a");
    expect(reopened.list("owner-1", "a").map((version) => version.id)).toEqual(["original", derived.id]);
    expect(reopened.currentVersion("owner-1", "a")?.id).toBe("original");
  });

  it("does not promote an invalid output and allows retry from the same parent", async () => {
    const { storage, analysis } = await fixture();
    const persistence = new InMemoryOptimizationPersistence();
    let shouldFail = true;
    const history = new ReversibleOptimizationHistory(storage, async (...args) => {
      if (shouldFail) { shouldFail = false; throw new Error("temporary analyzer failure"); }
      return analyzeGltf(...args);
    }, () => `id-${Math.random()}`, persistence);
    await history.seedOriginal({ id: "original", assetId: "a", ownerId: "owner-1", parentVersionId: "original", storageKey: parseStorageKey("assets/a/source/triangle.gltf"), sha256: "source", byteSize: 1, analysis });
    await expect(history.apply({ ownerId: "owner-1", assetId: "a", operation: "normalize", approve: true })).rejects.toThrow("temporary analyzer failure");
    expect(history.currentVersion("owner-1", "a")?.id).toBe("original");
    const retried = await history.retry("owner-1", "a");
    expect(retried.parentVersionId).toBe("original");
    expect(history.attemptsFor("owner-1", "a").map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
  });
});

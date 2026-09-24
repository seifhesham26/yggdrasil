// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { assets, assetVersions, optimizationOperations, sceneAnalyses } from "@/db/schema/assets";
import { testDb, postgres, migrateTestDatabase, resetTestDatabase, importedFixture, failWrite, ownerId } from "@/test/optimization-database";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { ReversibleOptimizationHistory } from "../application/reversible-optimization";
import { analyzeGltf } from "./gltf-analyzer";
import { DrizzleOptimizationPersistence } from "./optimization-persistence";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("Drizzle optimization persistence (embedded PostgreSQL)", () => {
  it.each([
    ["asset_versions", "INSERT", "NEW.kind = 'optimized'"],
    ["scene_analyses", "INSERT", "true"],
    ["optimization_operations", "INSERT", "NEW.status = 'succeeded'"],
    ["asset_versions", "INSERT OR UPDATE", "NEW.operation_id IS NOT NULL"],
    ["assets", "UPDATE", "true"],
  ])("rolls back %s %s failure without retaining deleted output", async (table, event, condition) => {
    const { storage, assetId, original, files } = await importedFixture();
    const sourceBefore = await storage.read(files[0].storageKey);
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, new DrizzleOptimizationPersistence());
    await history.reload(ownerId, assetId);
    await failWrite(table, event, condition);
    await expect(history.apply({ ownerId, assetId, operation: "normalize", approve: true })).rejects.toThrow();
    const reopened = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, new DrizzleOptimizationPersistence());
    await reopened.reload(ownerId, assetId);
    expect(reopened.list(ownerId, assetId).map((version) => version.id)).toEqual([original.id]);
    expect(reopened.currentVersion(ownerId, assetId)?.id).toBe(original.id);
    expect(reopened.attemptsFor(ownerId, assetId)).toEqual([expect.objectContaining({ status: "failed", parentVersionId: original.id })]);
    const failed = reopened.attemptsFor(ownerId, assetId)[0];
    expect(await storage.exists(parseStorageKey(`assets/${assetId}/versions/${failed.versionId}/model.glb`))).toBe(false);
    expect(await testDb.select().from(sceneAnalyses)).toHaveLength(1);
    expect(await storage.read(files[0].storageKey)).toEqual(sourceBefore);
    for (const version of reopened.list(ownerId, assetId)) expect(await storage.exists(version.storageKey)).toBe(true);
  });

  it("backfills null selection with the imported original ID and keeps its identity", async () => {
    const { assetId, original } = await importedFixture();
    await testDb.update(assets).set({ currentVersionId: null }).where(eq(assets.id, assetId));
    const loaded = await new DrizzleOptimizationPersistence().load(ownerId, assetId);
    expect(loaded.currentVersionId).toBe(original.id);
    expect(loaded.versions).toEqual([expect.objectContaining({ id: original.id, operation: "original" })]);
    expect((await testDb.select().from(assets))[0].currentVersionId).toBe(original.id);
    expect(await testDb.select().from(assetVersions)).toHaveLength(1);
  });

  it("round trips both operation names and distinct output IDs", async () => {
    const { storage, assetId, original } = await importedFixture();
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, new DrizzleOptimizationPersistence());
    await history.reload(ownerId, assetId);
    const normalized = await history.apply({ ownerId, assetId, operation: "normalize", approve: true });
    const pruned = await history.apply({ ownerId, assetId, operation: "remove-unused", approve: true });
    const loaded = await new DrizzleOptimizationPersistence().load(ownerId, assetId);
    expect(loaded.versions.map((version) => [version.id, version.operation])).toEqual([[original.id, "original"], [normalized.id, "normalize"], [pruned.id, "remove-unused"]]);
    expect(loaded.attempts.map((attempt) => attempt.versionId)).toEqual([normalized.id, pruned.id]);
    expect(loaded.attempts.every((attempt) => attempt.id !== attempt.versionId)).toBe(true);
  });

  it("rejects selecting a partially written version without a successful operation", async () => {
    const { assetId, original, analysis } = await importedFixture();
    const id = randomUUID();
    await testDb.insert(assetVersions).values({ ...original, id, kind: "optimized", storageKey: `assets/${assetId}/versions/${id}/model.glb`, parentVersionId: original.id });
    await testDb.insert(sceneAnalyses).values({ assetId, versionId: id, snapshot: analysis });
    await expect(new DrizzleOptimizationPersistence().setCurrent(ownerId, assetId, id)).rejects.toThrow("not available");
    expect((await new DrizzleOptimizationPersistence().load(ownerId, assetId)).currentVersionId).toBe(original.id);
  });

  it("retains committed output when the commit acknowledgement is lost", async () => {
    const { storage, assetId } = await importedFixture();
    const persistence = new DrizzleOptimizationPersistence();
    const promote = persistence.promote.bind(persistence);
    vi.spyOn(persistence, "promote").mockImplementation(async (...args) => { await promote(...args); throw new Error("lost commit acknowledgement"); });
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, persistence);
    await history.reload(ownerId, assetId);
    const version = await history.apply({ ownerId, assetId, operation: "normalize", approve: true });
    expect(await storage.exists(version.storageKey)).toBe(true);
    const loaded = await new DrizzleOptimizationPersistence().load(ownerId, assetId);
    expect(loaded.currentVersionId).toBe(version.id);
    expect(loaded.attempts).toEqual([expect.objectContaining({ status: "succeeded", versionId: version.id })]);
  });

  it("retries persisted parent/settings after a failed write, revert, and fresh instance", async () => {
    const { storage, assetId, original, files } = await importedFixture();
    const before = await Promise.all(files.map((file) => storage.read(file.storageKey)));
    const history = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, new DrizzleOptimizationPersistence());
    await history.reload(ownerId, assetId);
    const parent = await history.apply({ ownerId, assetId, operation: "normalize", approve: true });
    await failWrite("scene_analyses", "INSERT");
    await expect(history.apply({ ownerId, assetId, operation: "remove-unused", approve: true, settings: { keepExtras: false } })).rejects.toThrow();
    const failed = history.attemptsFor(ownerId, assetId).at(-1)!;
    await postgres.exec("DROP TRIGGER fail_write ON scene_analyses");
    await history.revert(ownerId, assetId, original.id);
    const reopened = new ReversibleOptimizationHistory(storage, analyzeGltf, randomUUID, new DrizzleOptimizationPersistence());
    await reopened.reload(ownerId, assetId);
    const version = await reopened.retry(ownerId, assetId);
    const loaded = await new DrizzleOptimizationPersistence().load(ownerId, assetId);
    expect(version.parentVersionId).toBe(parent.id);
    expect(loaded.attempts.at(-1)).toMatchObject({ versionId: version.id, parentVersionId: parent.id, retryOf: failed.id, operation: "remove-unused", settings: { keepExtras: false } });
    expect(await Promise.all(files.map((file) => storage.read(file.storageKey)))).toEqual(before);
  });

  it("rejects cross-owner and cross-asset selection writes", async () => {
    const { assetId, original } = await importedFixture();
    const persistence = new DrizzleOptimizationPersistence();
    await expect(persistence.setCurrent("other-owner", assetId, original.id)).rejects.toThrow();
    await expect(persistence.setCurrent(ownerId, assetId, randomUUID())).rejects.toThrow();
    expect(await persistence.load("other-owner", assetId)).toEqual({ versions: [], attempts: [] });
    expect(await testDb.select().from(optimizationOperations)).toHaveLength(0);
    expect(await testDb.select().from(assetVersions)).toHaveLength(1);
    expect(parseStorageKey(original.storageKey)).toBe(original.storageKey);
  });
});

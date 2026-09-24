// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { assetFiles, assetVersions, assets } from "@/db/schema/assets";
import { importedFixture, migrateTestDatabase, ownerId, postgres, resetTestDatabase, testDb } from "@/test/optimization-database";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeGltf } from "../infrastructure/gltf-analyzer";
import { DrizzleOptimizationPersistence } from "../infrastructure/optimization-persistence";
import { DrizzleVariantPersistence } from "../infrastructure/variant-persistence";
import { createSwitchAssetVariant } from "./variant-switch";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("post-import variant switching", () => {
  it("selects a retained alternate for preview while preserving all source bytes and version history", async () => {
    const { assetId, sourceId, storage, repository, files, original } = await importedFixture();
    const fixture = createGltfFixture();
    for (const file of [fixture.model, fixture.binary]) {
      const relativePath = `high/${file.relativePath}`;
      const key = `assets/${assetId}/source/${relativePath}`;
      await storage.put(key as Parameters<typeof storage.put>[0], file.bytes);
      await testDb.insert(assetFiles).values({
        sourceId, relativePath, storageKey: key, byteSize: file.bytes.byteLength,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
        mimeType: relativePath.endsWith(".gltf") ? "model/gltf+json" : "application/octet-stream",
        role: relativePath.endsWith(".gltf") ? "source" : "dependency",
      });
    }
    const switchVariant = createSwitchAssetVariant({
      storage, getAsset: (id, owner) => repository.getAsset(id, owner), promote: (input) => new DrizzleVariantPersistence().promote(input),
      analyze: analyzeGltf, createId: randomUUID,
    });
    const sourceBefore = await Promise.all(files.map((file) => storage.read(file.storageKey)));
    const selected = await switchVariant({ ownerId, assetId, selectedModelPath: "high/triangle.gltf" });
    expect(selected.storageKey).toContain(`/variants/${selected.versionId}/high/triangle.gltf`);
    const detail = await repository.getAsset(assetId, ownerId);
    expect(detail?.currentVersionId).toBe(selected.versionId);
    expect(detail?.selectedFile?.relativePath).toBe("high/triangle.gltf");
    expect(detail?.analysis?.counts.triangles).toBe(1);
    const history = await new DrizzleOptimizationPersistence().load(ownerId, assetId);
    expect(history.versions.map((version) => [version.id, version.operation])).toEqual([[original.id, "original"], [selected.versionId, "variant"]]);
    expect((await testDb.select().from(assetVersions).where(eq(assetVersions.assetId, assetId)))).toHaveLength(2);
    expect((await testDb.select().from(assets).where(eq(assets.id, assetId)))[0].status).toBe("ready");
    expect(await Promise.all(files.map((file) => storage.read(file.storageKey)))).toEqual(sourceBefore);
    await expect(switchVariant({ ownerId: "different-owner", assetId, selectedModelPath: "high/triangle.gltf" })).rejects.toThrow();
    await expect(switchVariant({ ownerId, assetId, selectedModelPath: "missing.gltf" })).rejects.toThrow();
  });
});

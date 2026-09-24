// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema/auth";
import { assets, assetSources } from "@/db/schema/assets";
import { migrateTestDatabase, ownerId, postgres, resetTestDatabase, testDb } from "@/test/optimization-database";
import { DrizzleAssetRepository } from "./asset-repository";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("DrizzleAssetRepository import identity", () => {
  it("reuses the same pending asset and source when a job retries", async () => {
    await testDb.insert(user).values({ id: ownerId, name: "Owner", email: "retry-owner@example.test" });
    const assetId = randomUUID();
    const repo = new DrizzleAssetRepository();
    const first = await repo.createImport({ ownerId, name: "Dragon", assetId });
    await repo.failImport(assetId, ownerId, "INTERRUPTED");
    const retried = await new DrizzleAssetRepository().createImport({ ownerId, name: "Dragon", assetId });
    expect(retried).toEqual(first);
    expect((await testDb.select().from(assets).where(eq(assets.id, assetId)))).toMatchObject([{ status: "importing", errorCode: null }]);
    expect(await testDb.select().from(assetSources).where(eq(assetSources.assetId, assetId))).toHaveLength(1);
  });
});

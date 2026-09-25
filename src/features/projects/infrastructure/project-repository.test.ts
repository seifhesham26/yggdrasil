// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { defaultProjectSnapshot } from "../domain/project-state";
import { importedFixture, migrateTestDatabase, ownerId, postgres, resetTestDatabase, testDb, failWrite } from "@/test/optimization-database";
import { DrizzleProjectRepository } from "./project-repository";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("DrizzleProjectRepository", () => {
  it("lists only projects for the owner and asset, and can undo the first save", async () => {
    const asset = await importedFixture();
    const repository = new DrizzleProjectRepository();
    const created = await repository.create({ ownerId, assetId: asset.assetId, name: "First" });
    const saved = await repository.save({ ownerId, projectId: created.project.id, expectedRevision: 0, snapshot: { ...defaultProjectSnapshot(), scene: { ...defaultProjectSnapshot().scene, background: "#123456" } }, activeStep: "Scene" });
    expect((await repository.listForAsset(ownerId, asset.assetId)).map((project) => project.id)).toEqual([created.project.id]);
    expect(await repository.listForAsset("other-owner", asset.assetId)).toEqual([]);
    expect((await repository.undo(ownerId, saved.project.id)).project.snapshot).toEqual(defaultProjectSnapshot());
    expect((await repository.redo(ownerId, saved.project.id)).project.snapshot.scene.background).toBe("#123456");
    await repository.undo(ownerId, saved.project.id);
    await repository.save({ ownerId, projectId: created.project.id, expectedRevision: 1, snapshot: { ...defaultProjectSnapshot(), scene: { ...defaultProjectSnapshot().scene, background: "#654321" } }, activeStep: "Scene" });
    await repository.undo(ownerId, saved.project.id);
    expect((await repository.redo(ownerId, saved.project.id)).project.snapshot.scene.background).toBe("#654321");
  });
  it("persists typed snapshots and a monotonic revision cursor across undo, redo, and branch saves", async () => {
    const asset = await importedFixture();
    const repository = new DrizzleProjectRepository();
    const created = await repository.create({ ownerId, assetId: asset.assetId, name: "Dragon" });
    expect(created.project.assetVersionId).toBe(asset.original.id);
    expect(created.steps.map(({ name }) => name)).toEqual(["Import", "Analyze", "Optimize", "Appearance", "Scene", "Interactions", "Animate", "Export"]);
    const first = await repository.save({ ownerId, projectId: created.project.id, expectedRevision: 0, snapshot: { ...defaultProjectSnapshot(), scene: { ...defaultProjectSnapshot().scene, background: "#112233" } }, activeStep: "Scene" });
    const second = await repository.save({ ownerId, projectId: created.project.id, expectedRevision: 1, snapshot: { ...first.project.snapshot, scene: { ...first.project.snapshot.scene, background: "#445566" } }, activeStep: "Scene" });
    const undone = await repository.undo(ownerId, created.project.id);
    expect(undone.project).toMatchObject({ revision: 2, snapshot: { scene: { background: "#112233" } } });
    expect((await repository.redo(ownerId, created.project.id)).project.snapshot.scene.background).toBe("#445566");
    await repository.undo(ownerId, created.project.id);
    const branch = await repository.save({ ownerId, projectId: created.project.id, expectedRevision: 2, snapshot: { ...first.project.snapshot, scene: { ...first.project.snapshot.scene, background: "#778899" } }, activeStep: "Scene" });
    expect(branch.project.revision).toBe(3);
    expect(branch.revisions.map(({ revision }) => revision)).toEqual([1, 2, 3]);
    expect(branch.project.snapshot.scene.background).toBe("#778899");
    expect((await repository.load("another-owner", created.project.id))).toBeNull();
    const [currentAsset] = await testDb.select().from(schema.assets).where(eq(schema.assets.id, asset.assetId));
    expect(currentAsset.currentVersionId).toBe(asset.original.id);
    expect((await testDb.select().from(schema.assetVersions).where(eq(schema.assetVersions.id, asset.original.id)))[0].sha256).toBe(asset.original.sha256);
  });

  it("rejects creation for another owner and stale writes", async () => {
    const asset = await importedFixture();
    await testDb.insert(schema.user).values({ id: "other-owner", email: "other@example.test", name: "Other" });
    const repository = new DrizzleProjectRepository();
    await expect(repository.create({ ownerId: "other-owner", assetId: asset.assetId })).rejects.toThrow(/not available/i);
    const project = await repository.create({ ownerId, assetId: asset.assetId });
    await expect(repository.save({ ownerId, projectId: project.project.id, expectedRevision: 4, snapshot: defaultProjectSnapshot(), activeStep: "Appearance" })).rejects.toThrow(/stale/i);
  });

  it("rolls back project state when revision persistence fails", async () => {
    const asset = await importedFixture();
    const repository = new DrizzleProjectRepository();
    const project = await repository.create({ ownerId, assetId: asset.assetId });
    await failWrite("project_revisions", "INSERT");
    await expect(repository.save({ ownerId, projectId: project.project.id, expectedRevision: 0, snapshot: defaultProjectSnapshot(), activeStep: "Scene" })).rejects.toThrow();
    expect((await repository.load(ownerId, project.project.id))?.project).toMatchObject({ revision: 0, currentRevisionId: null });
  });
});

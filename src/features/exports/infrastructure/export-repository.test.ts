// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { importedFixture, migrateTestDatabase, ownerId, postgres, resetTestDatabase, testDb } from "@/test/optimization-database";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { ExportService, publicExportJob } from "../application/export-service";
import { DrizzleExportRepository } from "./export-repository";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("export jobs", () => {
  it("freezes a revision, verifies files, and publishes only a complete owner-scoped manifest", async () => {
    const fixture = await importedFixture();
    const projects = new DrizzleProjectRepository();
    const project = await projects.create({ ownerId, assetId: fixture.assetId, name: "Triangle" });
    const repository = new DrizzleExportRepository();
    const queued = await repository.create(ownerId, project.project.id, "manifest");
    expect(queued?.status).toBe("queued");
    await projects.save({ ownerId, projectId: project.project.id, expectedRevision: 0, snapshot: { ...project.project.snapshot, scene: { ...project.project.snapshot.scene, background: "#123456" } }, activeStep: "Scene" });
    const service = new ExportService(repository, fixture.storage);
    const ready = await service.retry(ownerId, queued!.id);
    expect(ready?.status).toBe("ready");
    expect(ready?.manifest?.projectRevision).toBe(0);
    expect(ready?.manifest?.config.scene.background).toBe("#111417");
    expect(ready?.manifest?.files.map((file) => file.path)).toContain(`assets/source/${fixture.files[0].relativePath}`);
    const artifact = await repository.artifact(ownerId, queued!.id);
    expect(artifact?.byteSize).toBeGreaterThan(0);
    expect(JSON.stringify(publicExportJob(ready!))).not.toContain("storageKey");
    expect(await repository.get("other-owner", queued!.id)).toBeNull();
    expect(await repository.artifact("other-owner", queued!.id)).toBeNull();
    expect(await service.retry(ownerId, queued!.id)).toBeNull();
    expect((await testDb.select().from(schema.exportArtifacts).where(eq(schema.exportArtifacts.jobId, queued!.id)))).toHaveLength(1);
  });

  it("records a failure and succeeds on retry after the source metadata is repaired", async () => {
    const fixture = await importedFixture();
    const project = await new DrizzleProjectRepository().create({ ownerId, assetId: fixture.assetId });
    const repository = new DrizzleExportRepository();
    const service = new ExportService(repository, fixture.storage);
    await testDb.update(schema.assetVersions).set({ sha256: "0".repeat(64) }).where(eq(schema.assetVersions.id, fixture.original.id));
    const failed = await service.create(ownerId, project.project.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorCode).toBe("SOURCE_UNAVAILABLE");
    expect(await repository.artifact(ownerId, failed!.id)).toBeNull();
    await testDb.update(schema.assetVersions).set({ sha256: fixture.original.sha256 }).where(eq(schema.assetVersions.id, fixture.original.id));
    const ready = await service.retry(ownerId, failed!.id);
    expect(ready?.status).toBe("ready");
    expect(ready?.manifest?.modelPath).toBe(`assets/source/${fixture.files[0].relativePath}`);
  });
});

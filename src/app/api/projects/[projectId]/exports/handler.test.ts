// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { importedFixture, migrateTestDatabase, ownerId, postgres, resetTestDatabase } from "@/test/optimization-database";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { ExportService } from "@/features/exports/application/export-service";
import { DrizzleExportRepository } from "@/features/exports/infrastructure/export-repository";
import { createExportHandler } from "./handler";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

describe("export API", () => {
  it("requires owner access, rejects unsupported targets, and serves a validated private manifest", async () => {
    const fixture = await importedFixture();
    const history = new ProjectHistory(new DrizzleProjectRepository());
    const project = await history.create({ ownerId, assetId: fixture.assetId });
    const service = new ExportService(new DrizzleExportRepository(), fixture.storage);
    const request = (body: unknown) => new Request("http://localhost/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const anonymous = createExportHandler({ getSession: async () => null, history, service, storage: fixture.storage });
    expect((await anonymous.GET(new Request("http://localhost"), project.project.id)).status).toBe(401);
    expect((await anonymous.POST(request({ target: "manifest" }), project.project.id)).status).toBe(401);
    const foreign = createExportHandler({ getSession: async () => ({ user: { id: "other-owner" } }), history, service, storage: fixture.storage });
    expect((await foreign.POST(request({ target: "manifest" }), project.project.id)).status).toBe(404);
    const handler = createExportHandler({ getSession: async () => ({ user: { id: ownerId } }), history, service, storage: fixture.storage });
    expect((await handler.POST(request({ target: "react" }), project.project.id)).status).toBe(400);
    const created = await handler.POST(request({ target: "manifest" }), project.project.id);
    expect(created.status).toBe(201);
    const job = await created.json() as { id: string; status: string };
    expect(job.status).toBe("ready");
    const download = await handler.MANIFEST(new Request("http://localhost"), project.project.id, job.id);
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    const manifest = await download.json() as { projectId: string; files: Array<{ path: string }> };
    expect(manifest.projectId).toBe(project.project.id);
    expect(manifest.files[0].path).toMatch(/^assets\/source\//);
    expect((await handler.GET(new Request("http://localhost"), project.project.id)).status).toBe(200);
    expect((await handler.RETRY(new Request("http://localhost", { method: "POST" }), project.project.id, job.id)).status).toBe(409);
    expect((await foreign.MANIFEST(new Request("http://localhost"), project.project.id, job.id)).status).toBe(404);
  });
});

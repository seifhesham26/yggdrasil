import { describe, expect, it } from "vitest";
import { defaultProjectSnapshot } from "@/features/projects/domain/project-state";
import { InMemoryProjectRepository, ProjectHistory } from "@/features/projects/application/project-history";
import { createProjectHandler } from "./handler";

describe("project API", () => {
  it("requires the owner before reading or mutating project state", async () => {
    const handler = createProjectHandler({ getSession: async () => null, history: new ProjectHistory(new InMemoryProjectRepository({})) });
    expect((await handler.GET("project-1")).status).toBe(401);
    expect((await handler.PATCH("project-1", new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "save", expectedRevision: 0, snapshot: defaultProjectSnapshot() }) }))).status).toBe(401);
  });

  it("loads only the authenticated owner's project", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const project = await history.create({ ownerId: "owner-1", assetId: "asset-1" });
    const handler = createProjectHandler({ getSession: async () => ({ user: { id: "owner-2" } }), history });
    expect((await handler.GET(project.project.id)).status).toBe(404);
  });

  it("persists a valid snapshot and reports stale revisions as conflicts", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const project = await history.create({ ownerId: "owner-1", assetId: "asset-1" });
    const handler = createProjectHandler({ getSession: async () => ({ user: { id: "owner-1" } }), history });
    const request = (expectedRevision: number) => new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", expectedRevision, snapshot: { ...defaultProjectSnapshot(), scene: { ...defaultProjectSnapshot().scene, background: "#223344" } }, activeStep: "Scene" }) });
    expect((await handler.PATCH(project.project.id, request(0))).status).toBe(200);
    expect((await handler.PATCH(project.project.id, request(0))).status).toBe(409);
    expect((await handler.GET(project.project.id)).status).toBe(200);
  });

  it("rejects step counters outside the PostgreSQL integer range", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const project = await history.create({ ownerId: "owner-1", assetId: "asset-1" });
    const handler = createProjectHandler({ getSession: async () => ({ user: { id: "owner-1" } }), history });
    const response = await handler.PATCH(project.project.id, new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", expectedRevision: 0, snapshot: defaultProjectSnapshot(), activeStep: "Scene", steps: { Scene: { status: "warning", warningCount: 2_147_483_648 } } }) }));
    expect(response.status).toBe(400);
  });
});

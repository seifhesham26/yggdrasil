import { describe, expect, it } from "vitest";
import { InMemoryProjectRepository, ProjectHistory } from "@/features/projects/application/project-history";
import { createProjectHandler } from "./handler";

describe("asset project API", () => {
  it("lists only authenticated projects for an asset", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "retained-version" }));
    await history.create({ ownerId: "owner-1", assetId: "asset-1", name: "Private" });
    const owner = createProjectHandler({ getSession: async () => ({ user: { id: "owner-1" } }), history });
    const other = createProjectHandler({ getSession: async () => ({ user: { id: "owner-2" } }), history });
    expect((await owner.GET("asset-1", new Request("http://localhost"))).status).toBe(200);
    expect((await (await owner.GET("asset-1", new Request("http://localhost"))).json()).projects).toMatchObject([{ name: "Private" }]);
    expect((await (await other.GET("asset-1", new Request("http://localhost"))).json()).projects).toEqual([]);
  });
  it("requires an owner before creating a project", async () => {
    const handler = createProjectHandler({ getSession: async () => null, history: new ProjectHistory(new InMemoryProjectRepository({})) });
    const response = await handler.POST("asset-1", new Request("http://localhost", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("creates a project against the selected asset version", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "retained-version" }));
    const handler = createProjectHandler({ getSession: async () => ({ user: { id: "owner-1" } }), history });
    const response = await handler.POST("asset-1", new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Dragon" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ project: { assetId: "asset-1", assetVersionId: "retained-version", name: "Dragon" } });
  });
});

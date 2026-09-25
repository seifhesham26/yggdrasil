import { describe, expect, it } from "vitest";
import { defaultProjectSnapshot } from "../domain/project-state";
import { InMemoryProjectRepository, ProjectHistory } from "./project-history";

describe("ProjectHistory", () => {
  it("saves typed revisions and can undo and redo without deleting later edits", async () => {
    const repository = new InMemoryProjectRepository({ "asset-1": "version-1" });
    const history = new ProjectHistory(repository);
    const created = await history.create({ ownerId: "owner-1", assetId: "asset-1", name: "Dragon" });
    const first = await history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: 0, snapshot: { ...defaultProjectSnapshot(), scene: { ...defaultProjectSnapshot().scene, background: "#112233" } }, activeStep: "Scene" });
    const second = await history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: first.project.revision, snapshot: { ...first.project.snapshot, scene: { ...first.project.snapshot.scene, background: "#445566" } }, activeStep: "Scene" });
    expect((await history.undo("owner-1", created.project.id)).project.snapshot.scene.background).toBe("#112233");
    expect((await history.redo("owner-1", created.project.id)).project.snapshot.scene.background).toBe("#445566");
    await history.undo("owner-1", created.project.id);
    const branched = await history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: second.project.revision, snapshot: { ...first.project.snapshot, scene: { ...first.project.snapshot.scene, background: "#778899" } }, activeStep: "Scene" });
    expect(branched.project.snapshot.scene.background).toBe("#778899");
    expect((await history.list("owner-1", created.project.id))?.revisions).toHaveLength(3);
    expect(second.project.revision).toBe(2);
  });

  it("rejects stale saves", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const created = await history.create({ ownerId: "owner-1", assetId: "asset-1", name: "Dragon" });
    await expect(history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: 7, snapshot: defaultProjectSnapshot(), activeStep: "Appearance" })).rejects.toThrow(/stale/i);
  });

  it("requires an explicit retained asset version fixture", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({}));
    await expect(history.create({ ownerId: "owner-1", assetId: "asset-1" })).rejects.toThrow(/fixture/i);
  });
});

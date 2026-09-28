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

  it("stores sequence order and crossfade settings in revision history", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const created = await history.create({ ownerId: "owner-1", assetId: "asset-1" });
    const clipId = crypto.randomUUID();
    const snapshot = defaultProjectSnapshot();
    snapshot.animation.embeddedClips = [{ id: clipId, sourceIndex: 0, name: "Rise", enabled: true, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat" }];
    snapshot.animation.sequence = [
      { id: crypto.randomUUID(), clipId, durationSeconds: 1, overlapSeconds: 0, sourceOffsetSeconds: 0, weight: 1, enabled: true },
      { id: crypto.randomUUID(), clipId, durationSeconds: 1, overlapSeconds: 0.25, sourceOffsetSeconds: 0.2, weight: 0.8, enabled: true },
    ];
    snapshot.animation.sequenceLoop = true;
    await history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: 0, snapshot, activeStep: "Animate" });
    const reopened = await history.load("owner-1", created.project.id);
    expect(reopened?.project.snapshot.animation.sequence).toEqual(snapshot.animation.sequence);
    expect(reopened?.project.snapshot.animation.sequenceLoop).toBe(true);
    expect((await history.undo("owner-1", created.project.id)).project.snapshot.animation.sequence).toEqual([]);
    expect((await history.redo("owner-1", created.project.id)).project.snapshot.animation.sequence).toEqual(snapshot.animation.sequence);
  });

  it("persists visual timeline tracks and trigger through undo and redo", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
    const created = await history.create({ ownerId: "owner-1", assetId: "asset-1" });
    const snapshot = defaultProjectSnapshot();
    snapshot.animation.timelines = [{ id: crypto.randomUUID(), name: "Open", enabled: true, durationSeconds: 2, trigger: { type: "click", targetId: "0:Mesh:Face" }, tracks: [{ id: crypto.randomUUID(), target: "part", targetId: "0:Mesh:Face", property: "position.x", keyframes: [{ at: 0, value: 0 }, { at: 2, value: 3 }] }] }];
    await history.save({ ownerId: "owner-1", projectId: created.project.id, expectedRevision: 0, snapshot, activeStep: "Animate" });
    expect((await history.load("owner-1", created.project.id))?.project.snapshot.animation.timelines).toEqual(snapshot.animation.timelines);
    expect((await history.undo("owner-1", created.project.id)).project.snapshot.animation.timelines).toEqual([]);
    expect((await history.redo("owner-1", created.project.id)).project.snapshot.animation.timelines).toEqual(snapshot.animation.timelines);
  });

  it("requires an explicit retained asset version fixture", async () => {
    const history = new ProjectHistory(new InMemoryProjectRepository({}));
    await expect(history.create({ ownerId: "owner-1", assetId: "asset-1" })).rejects.toThrow(/fixture/i);
  });
});

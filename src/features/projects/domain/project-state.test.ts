import { describe, expect, it } from "vitest";
import { defaultProjectSnapshot, parseProjectSnapshot } from "./project-state";

describe("project state", () => {
  it("migrates a legacy empty configuration into the current typed snapshot", () => {
    expect(parseProjectSnapshot({})).toEqual(defaultProjectSnapshot());
  });

  it("rejects executable interaction payloads", () => {
    expect(() => parseProjectSnapshot({ interactions: [{ id: "i1", targetNodeId: "mesh-1", trigger: "click", action: { type: "toggle-visibility", script: "alert(1)" } }] })).toThrow(/script/i);
  });

  it("does not relabel unsupported future snapshots as the current schema", () => {
    expect(() => parseProjectSnapshot({ schemaVersion: 2 })).toThrow();
  });

  it("round-trips an attached imported clip and its explicit bone mapping", () => {
    const snapshot = parseProjectSnapshot({
      animation: {
        clips: [],
        timelines: [],
        embeddedClips: [],
        importedClips: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Imported walk",
          sourceFileName: "walk.gltf",
          sourceClipIndex: 0,
          sourceStorageKey: "assets/project/imports/walk.gltf",
          sourceSha256: "a".repeat(64),
          durationSeconds: 2, trimStart: 0, trimEnd: 2, speed: 1, loop: "repeat",
          tracks: [{ sourceTarget: "Arm.L", targetNode: "Arm.L", path: "rotation", component: null, status: "matched", times: [0, 2], values: [0, 0, 0, 1] }],
          mapping: [{ sourceBone: "Arm.L", targetBone: "Arm.L", status: "matched" }],
          enabled: true,
        }],
      },
    });
    expect(snapshot.animation.importedClips[0]).toMatchObject({ name: "Imported walk", sourceSha256: "a".repeat(64), enabled: true });
    expect(parseProjectSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("rejects imported clips that still contain unresolved mapping", () => {
    expect(() => parseProjectSnapshot({
      animation: {
        clips: [], timelines: [], embeddedClips: [], importedClips: [{
          id: "11111111-1111-4111-8111-111111111111", name: "Broken", sourceFileName: "broken.gltf", sourceClipIndex: 0,
          sourceStorageKey: "assets/project/imports/broken.gltf", sourceSha256: "b".repeat(64), durationSeconds: 1, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat",
          tracks: [{ sourceTarget: "Arm", targetNode: null, path: "rotation", component: null, status: "missing", times: [0, 1], values: [0, 0, 0, 1] }],
          mapping: [{ sourceBone: "Arm", targetBone: null, status: "missing" }], enabled: true,
        }],
      },
    })).toThrow(/mapping/i);
  });
});

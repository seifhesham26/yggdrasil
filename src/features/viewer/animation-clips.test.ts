import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, Bone, Group, NumberKeyframeTrack } from "three";
import { advanceClip, clipTime, inspectClips, playableClip, sourceClipEdit } from "./animation-clips";
import { parseProjectSnapshot } from "@/features/projects/domain/project-state";

describe("embedded clips", () => {
  it("preserves source order and reports targets, skeleton, morph and missing nodes", () => {
    const scene = new Group();
    const bone = new Bone(); bone.name = "Arm"; scene.add(bone);
    const clips = [
      new AnimationClip("Z walk", 2, [new NumberKeyframeTrack("Arm.position[x]", [0, 2], [0, 1])]),
      new AnimationClip("A face", 3, [new NumberKeyframeTrack("Missing.morphTargetInfluences[0]", [0, 3], [0, 1])]),
    ];
    expect(inspectClips(clips, scene)).toMatchObject([
      { sourceIndex: 0, name: "Z walk", durationSeconds: 2, targets: ["Arm"], usesSkeleton: true, usesMorph: false, missingTargets: [] },
      { sourceIndex: 1, name: "A face", durationSeconds: 3, targets: ["Missing"], usesSkeleton: false, usesMorph: true, missingTargets: ["Missing"] },
    ]);
  });

  it("validates project copies without changing source metadata and migrates older snapshots", () => {
    const source = { sourceIndex: 0, name: "Rise", durationSeconds: 2, targets: [], usesSkeleton: false, usesMorph: false, missingTargets: [] };
    const edit = sourceClipEdit(source);
    const snapshot = parseProjectSnapshot({ animation: { clips: [], timelines: [], embeddedClips: [{ ...edit, name: "Fast Rise", speed: 2, trimEnd: 1 }] } });
    expect(snapshot.animation.embeddedClips[0]).toMatchObject({ sourceIndex: 0, name: "Fast Rise", speed: 2, trimEnd: 1 });
    expect(source.name).toBe("Rise");
    expect(parseProjectSnapshot({ animation: { clips: [], timelines: [] } }).animation.embeddedClips).toEqual([]);
    expect(() => parseProjectSnapshot({ animation: { embeddedClips: [{ ...edit, trimStart: 2, trimEnd: 1 }], clips: [], timelines: [] } })).toThrow(/Trim end/);
  });

  it("scrubs, trims, retimes and loops deterministically", () => {
    const edit = { ...sourceClipEdit({ sourceIndex: 0, name: "Rise", durationSeconds: 3, targets: [], usesSkeleton: false, usesMorph: false, missingTargets: [] }), trimStart: 1, trimEnd: 2, speed: 2 };
    expect(clipTime(edit, 0.5)).toBe(1.5);
    expect(advanceClip(edit, 1.8, 0.2, 1)).toEqual({ time: 1.2000000000000002, direction: 1, finished: false });
    expect(advanceClip({ ...edit, loop: "once" }, 1.8, 0.2, 1)).toEqual({ time: 2, direction: 1, finished: true });
    expect(advanceClip({ ...edit, loop: "pingpong" }, 1.8, 0.2, 1)).toMatchObject({ direction: -1, finished: false });
    expect(advanceClip({ ...edit, loop: "pingpong" }, 1.8, 0.2, 1).time).toBeCloseTo(1.8);
    expect(advanceClip({ ...edit, loop: "pingpong" }, 1.2, 0.2, -1)).toMatchObject({ direction: 1, finished: false });
    expect(advanceClip({ ...edit, loop: "pingpong" }, 1.2, 0.2, -1).time).toBeCloseTo(1.2);
  });

  it("filters missing targets and previews remaining tracks without crashing", () => {
    const scene = new Group();
    const bone = new Bone(); bone.name = "Arm"; scene.add(bone);
    const source = new AnimationClip("Mixed", 1, [
      new NumberKeyframeTrack("Arm.position[x]", [0, 1], [0, 1]),
      new NumberKeyframeTrack("Gone.position[x]", [0, 1], [0, 1]),
    ]);
    const safe = playableClip(source, ["Gone"]);
    expect(safe.tracks.map((track) => track.name)).toEqual(["Arm.position[x]"]);
    expect(source.tracks).toHaveLength(2);
    const mixer = new AnimationMixer(scene);
    mixer.clipAction(safe).play();
    expect(() => mixer.update(0.5)).not.toThrow();
    expect(bone.position.x).toBeCloseTo(0.5);
  });
});

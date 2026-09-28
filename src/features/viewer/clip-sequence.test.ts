import { describe, expect, it } from "vitest";
import { AnimationClip, Group, NumberKeyframeTrack } from "three";
import { defaultProjectSnapshot, parseProjectSnapshot } from "@/features/projects/domain/project-state";
import { SequencePlayer, sequenceAt, sequenceDuration, sequenceSchedule, sequenceWarnings } from "./clip-sequence";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const segment = (id: string, clipId: string, overlapSeconds = 0) => ({
  id, clipId, durationSeconds: 2, overlapSeconds, sourceOffsetSeconds: 0, weight: 1, enabled: true,
});
const clip = (id: string) => ({ id, sourceIndex: 0, name: id, enabled: true, trimStart: 0, trimEnd: 2, speed: 1, loop: "once" as const });

describe("clip sequence", () => {
  it("schedules sequential clips and evaluates source offsets and speed", () => {
    const items = [segment(firstId, firstId), { ...segment(secondId, secondId), sourceOffsetSeconds: 0.25 }];
    const edits = new Map([[firstId, clip(firstId)], [secondId, { ...clip(secondId), speed: 2 }]]);
    expect(sequenceDuration(items)).toBe(4);
    expect(sequenceAt(items, edits, 0.5, false)).toMatchObject([{ clipId: firstId, sourceTime: 0.5, weight: 1 }]);
    expect(sequenceAt(items, edits, 2.5, false)).toMatchObject([{ clipId: secondId, sourceTime: 1.25, weight: 1 }]);
    expect(sequenceSchedule(items).map((entry) => entry.start)).toEqual([0, 2]);
  });

  it("crossfades overlapping clips and gives deterministic poses when scrubbing backwards", () => {
    const items = [segment(firstId, firstId), segment(secondId, secondId, 1)];
    const edits = new Map([[firstId, clip(firstId)], [secondId, clip(secondId)]]);
    expect(sequenceAt(items, edits, 1.5, false).map((entry) => entry.weight)).toEqual([0.5, 0.5]);
    const root = new Group(); root.name = "Root";
    const original = new AnimationClip("zero", 2, [new NumberKeyframeTrack("Root.position[x]", [0, 2], [0, 0])]);
    const other = new AnimationClip("ten", 2, [new NumberKeyframeTrack("Root.position[x]", [0, 2], [10, 10])]);
    const player = new SequencePlayer(root, items, edits, new Map([[firstId, original], [secondId, other]]));
    player.seek(1.5, false);
    expect(root.position.x).toBeCloseTo(5);
    player.seek(0.5, false);
    expect(root.position.x).toBeCloseTo(0);
    player.seek(1.5, false);
    expect(root.position.x).toBeCloseTo(5);
    expect(original.tracks[0].name).toBe("Root.position[x]");
    expect([...original.tracks[0].values]).toEqual([0, 0]);
    player.dispose();
  });

  it("wraps a looping sequence and skips disabled clips without changing their schedule", () => {
    const items = [segment(firstId, firstId), { ...segment(secondId, secondId), enabled: false }];
    const edits = new Map([[firstId, clip(firstId)], [secondId, clip(secondId)]]);
    expect(sequenceAt(items, edits, 4.25, true)).toMatchObject([{ clipId: firstId, sourceTime: 0.25 }]);
    expect(sequenceAt(items, edits, 3, false)).toEqual([]);
    expect(sequenceDuration(items)).toBe(4);
  });

  it("persists and validates the sequence and warns about missing or incompatible sources", () => {
    const snapshot = defaultProjectSnapshot();
    snapshot.animation.embeddedClips = [clip(firstId), clip(secondId)];
    snapshot.animation.sequence = [segment(firstId, firstId), segment(secondId, secondId, 1)];
    snapshot.animation.sequenceLoop = true;
    expect(parseProjectSnapshot(JSON.parse(JSON.stringify(snapshot))).animation.sequence).toEqual(snapshot.animation.sequence);
    expect(() => parseProjectSnapshot({ ...snapshot, animation: { ...snapshot.animation, sequence: [segment(firstId, firstId, 1)] } })).toThrow(/Overlap/);
    const sizeOne = new AnimationClip("scalar", 2, [new NumberKeyframeTrack("Root.position[x]", [0, 2], [0, 1])]);
    const sizeThree = new AnimationClip("vector", 2, [new NumberKeyframeTrack("Root.position", [0, 2], [0, 0, 0, 1, 0, 0])]);
    const warnings = sequenceWarnings(snapshot.animation.sequence, new Map([[firstId, sizeOne], [secondId, sizeThree]]));
    expect(warnings).toContain("Overlapping clips target Root.position with incompatible track shapes.");
    expect(sequenceWarnings(snapshot.animation.sequence, new Map([[firstId, sizeOne]]))).toContain(`Sequence clip ${secondId} is unavailable.`);
  });
});

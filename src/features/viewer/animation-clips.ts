import { AnimationClip, type Object3D } from "three";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";

export type ClipSource = {
  sourceIndex: number; name: string; durationSeconds: number;
  targets: string[]; usesSkeleton: boolean; usesMorph: boolean; missingTargets: string[];
};
export type ClipEdit = ProjectSnapshot["animation"]["embeddedClips"][number];
export type AnimationPreview = { clip: ClipEdit | null; playing: boolean; progress: number; restartToken: number };

export function inspectClips(clips: AnimationClip[], scene: Object3D): ClipSource[] {
  const names = new Set<string>();
  const skeletonNames = new Set<string>();
  scene.traverse((node) => {
    names.add(node.name); names.add(node.uuid);
    if ((node as Object3D & { isBone?: boolean }).isBone) skeletonNames.add(node.name);
  });
  return clips.map((clip, sourceIndex) => {
    const targets = [...new Set(clip.tracks.map((track) => track.name.split(".")[0]))];
    return {
      sourceIndex, name: clip.name || `Clip ${sourceIndex + 1}`, durationSeconds: clip.duration,
      targets, usesSkeleton: targets.some((target) => skeletonNames.has(target)),
      usesMorph: clip.tracks.some((track) => track.name.includes(".morphTargetInfluences")),
      missingTargets: targets.filter((target) => !names.has(target)),
    };
  });
}

export function sourceClipEdit(source: ClipSource): ClipEdit {
  return { id: crypto.randomUUID(), sourceIndex: source.sourceIndex, name: source.name,
    enabled: true, trimStart: 0, trimEnd: Math.max(0.001, source.durationSeconds), speed: 1, loop: "repeat" };
}

export function playableClip(source: AnimationClip, missingTargets: string[]): AnimationClip {
  if (!missingTargets.length) return source;
  const missing = new Set(missingTargets);
  return new AnimationClip(source.name, source.duration, source.tracks.filter((track) => !missing.has(track.name.split(".")[0])));
}

export function clipTime(edit: ClipEdit, progress: number): number {
  return edit.trimStart + Math.max(0, Math.min(1, progress)) * (edit.trimEnd - edit.trimStart);
}

export function advanceClip(edit: ClipEdit, current: number, delta: number, direction: 1 | -1): { time: number; direction: 1 | -1; finished: boolean } {
  const next = current + delta * edit.speed * direction;
  if (next >= edit.trimStart && next <= edit.trimEnd) return { time: next, direction, finished: false };
  if (edit.loop === "once") return { time: direction === 1 ? edit.trimEnd : edit.trimStart, direction, finished: true };
  const length = edit.trimEnd - edit.trimStart;
  if (edit.loop === "repeat") return { time: edit.trimStart + (((next - edit.trimStart) % length) + length) % length, direction: 1, finished: false };
  const period = length * 2;
  const phase = direction === 1 ? current - edit.trimStart : period - (current - edit.trimStart);
  const wrapped = ((phase + delta * edit.speed) % period + period) % period;
  return { time: edit.trimStart + (wrapped <= length ? wrapped : period - wrapped), direction: wrapped < length ? 1 : -1, finished: false };
}

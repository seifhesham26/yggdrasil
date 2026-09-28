import { AnimationClip, AnimationMixer, type AnimationAction, type Object3D } from "three";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import type { ClipTimingEdit } from "./animation-clips";

export type SequenceSegment = ProjectSnapshot["animation"]["sequence"][number];
export type ScheduledSegment = { segment: SequenceSegment; start: number; end: number };
export type SequencePose = { id: string; clipId: string; sourceTime: number; weight: number };

export function sequenceSchedule(items: SequenceSegment[]): ScheduledSegment[] {
  let end = 0;
  return items.map((segment) => {
    const start = end - segment.overlapSeconds;
    end = start + segment.durationSeconds;
    return { segment, start, end };
  });
}

export function sequenceDuration(items: SequenceSegment[]): number {
  return sequenceSchedule(items).at(-1)?.end ?? 0;
}

function localClipTime(edit: ClipTimingEdit, sourceOffset: number, elapsed: number): number {
  const length = edit.trimEnd - edit.trimStart;
  const position = Math.max(0, sourceOffset + elapsed * edit.speed);
  if (edit.loop === "once") return edit.trimStart + Math.min(length, position);
  if (edit.loop === "repeat") return edit.trimStart + (position % length);
  const phase = position % (length * 2);
  return edit.trimStart + (phase <= length ? phase : length * 2 - phase);
}

export function sequenceAt(items: SequenceSegment[], edits: ReadonlyMap<string, ClipTimingEdit>, seconds: number, loop: boolean): SequencePose[] {
  const schedule = sequenceSchedule(items);
  const duration = schedule.at(-1)?.end ?? 0;
  if (!duration) return [];
  const time = loop ? ((seconds % duration) + duration) % duration : Math.min(Math.max(0, seconds), duration - 1e-6);
  return schedule.flatMap(({ segment, start, end }, index) => {
    const edit = edits.get(segment.clipId);
    if (!segment.enabled || !edit?.enabled || time < start || time >= end) return [];
    const fadeIn = segment.overlapSeconds ? Math.min(1, (time - start) / segment.overlapSeconds) : 1;
    const nextOverlap = items[index + 1]?.overlapSeconds ?? 0;
    const fadeOut = nextOverlap ? Math.min(1, (end - time) / nextOverlap) : 1;
    return [{ id: segment.id, clipId: segment.clipId,
      sourceTime: localClipTime(edit, segment.sourceOffsetSeconds, time - start),
      weight: segment.weight * Math.min(fadeIn, fadeOut) }];
  });
}

function bindingBase(name: string): string { return name.replace(/\[[^\]]+\]$/, ""); }

export function sequenceWarnings(items: SequenceSegment[], clips: ReadonlyMap<string, AnimationClip>): string[] {
  const warnings = new Set<string>();
  const schedule = sequenceSchedule(items);
  for (const item of items) if (!clips.has(item.clipId)) warnings.add(`Sequence clip ${item.clipId} is unavailable.`);
  for (let index = 1; index < schedule.length; index++) {
    const earlier = schedule[index - 1];
    const later = schedule[index];
    if (!earlier.segment.enabled || !later.segment.enabled || later.start >= earlier.end) continue;
    const left = clips.get(earlier.segment.clipId);
    const right = clips.get(later.segment.clipId);
    if (!left || !right) continue;
    for (const track of left.tracks) for (const other of right.tracks) {
      if (bindingBase(track.name) === bindingBase(other.name) && track.getValueSize() !== other.getValueSize()) {
        warnings.add(`Overlapping clips target ${bindingBase(track.name)} with incompatible track shapes.`);
      }
    }
  }
  return [...warnings];
}

/** Each segment receives its own cloned clip and action; seeking never edits source tracks. */
export class SequencePlayer {
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly root: Object3D;
  private readonly items: SequenceSegment[];
  private readonly edits: ReadonlyMap<string, ClipTimingEdit>;

  constructor(root: Object3D, items: SequenceSegment[], edits: ReadonlyMap<string, ClipTimingEdit>, clips: ReadonlyMap<string, AnimationClip>) {
    this.root = root;
    this.items = items;
    this.edits = edits;
    this.mixer = new AnimationMixer(root);
    for (const segment of items) {
      const source = clips.get(segment.clipId);
      if (!source) continue;
      const action = this.mixer.clipAction(source.clone());
      action.setEffectiveWeight(0).play();
      this.actions.set(segment.id, action);
    }
  }

  seek(seconds: number, loop: boolean): SequencePose[] {
    const poses = sequenceAt(this.items, this.edits, seconds, loop);
    const byId = new Map(poses.map((pose) => [pose.id, pose]));
    for (const [id, action] of this.actions) {
      const pose = byId.get(id);
      action.time = pose?.sourceTime ?? 0;
      action.setEffectiveWeight(pose?.weight ?? 0);
    }
    this.mixer.update(0);
    return poses;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

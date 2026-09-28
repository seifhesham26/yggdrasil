import gsap from "gsap";
import { Mesh, MeshStandardMaterial, PerspectiveCamera, type Camera, type Light, type Object3D } from "three";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import { indexSceneParts } from "@/features/projects/ui/scene-parts";

export type VisualTimeline = ProjectSnapshot["animation"]["timelines"][number];
type Track = VisualTimeline["tracks"][number];
type MutableTarget = Record<string, number>;

export function timelineTarget(root: Object3D, camera: Camera, lights: Record<string, Light>, track: Track): { object: MutableTarget; property: string; after?: () => void } | null {
  const part = indexSceneParts(root).find((item) => item.id === track.targetId || (track.target === "morph" && track.targetId.startsWith(`${item.id}:`)));
  let target: unknown;
  let after: (() => void) | undefined;
  if (track.target === "part") target = part?.object;
  if (track.target === "material" && part?.object instanceof Mesh) {
    const material = Array.isArray(part.object.material) ? part.object.material[0] : part.object.material;
    if (material instanceof MeshStandardMaterial) { target = material; after = () => { material.transparent = material.opacity < 1; material.needsUpdate = true; }; }
  }
  if (track.target === "camera" && track.targetId === "main") {
    target = camera;
    if (camera instanceof PerspectiveCamera) after = () => camera.updateProjectionMatrix();
  }
  if (track.target === "light") target = lights[track.targetId];
  if (track.target === "morph" && part?.object instanceof Mesh) {
    const index = Number(track.targetId.slice(part.id.length + 1));
    if (Number.isInteger(index) && index >= 0 && index < (part.object.morphTargetInfluences?.length ?? 0)) {
      const influences = part.object.morphTargetInfluences!;
      target = { get influence() { return influences[index]; }, set influence(value: number) { influences[index] = value; } };
    }
  }
  if (!target || typeof target !== "object") return null;
  const path = track.property.split(".");
  const object = path.length === 2 ? (target as Record<string, unknown>)[path[0]] : target;
  const property = path.at(-1)!;
  if (!object || typeof object !== "object" || typeof (object as Record<string, unknown>)[property] !== "number") return null;
  return { object: object as MutableTarget, property, after };
}

/** Owns every GSAP tween and restores all touched values on teardown. */
export class VisualTimelinePlayer {
  readonly warnings: string[] = [];
  private readonly timeline = gsap.timeline({ paused: true });
  private readonly originals: { object: MutableTarget; property: string; value: number; after?: () => void }[] = [];
  constructor(readonly spec: VisualTimeline, root: Object3D, camera: Camera, lights: Record<string, Light>, private readonly reducedMotion = false) {
    for (const track of spec.tracks) {
      const resolved = timelineTarget(root, camera, lights, track);
      if (!resolved) { this.warnings.push(`Unavailable ${track.target} target ${track.targetId} for ${track.property}.`); continue; }
      const { object, property, after } = resolved;
      this.originals.push({ object, property, value: object[property], after });
      const frames = track.keyframes;
      for (let index = 1; index < frames.length; index++) {
        const previous = frames[index - 1]; const next = frames[index];
        this.timeline.fromTo(object, { [property]: previous.value }, { [property]: next.value, duration: next.at - previous.at, ease: "none", onUpdate: after }, previous.at);
      }
    }
    if (this.timeline.duration() < spec.durationSeconds) this.timeline.to({}, { duration: spec.durationSeconds - this.timeline.duration() }, this.timeline.duration());
    if (reducedMotion) this.seek(1);
    else this.seek(0);
  }
  seek(progress: number) {
    this.timeline.pause().progress(Math.max(0, Math.min(1, progress)), false);
    for (const entry of this.originals) entry.after?.();
  }
  play() { if (this.reducedMotion) this.seek(1); else this.timeline.restart(); }
  fire(type: VisualTimeline["trigger"]["type"], targetId: string | null = null) {
    if (!this.spec.enabled || this.spec.trigger.type !== type) return false;
    if (this.spec.trigger.targetId && this.spec.trigger.targetId !== targetId) return false;
    this.play(); return true;
  }
  dispose() {
    this.timeline.kill();
    for (const entry of this.originals) { entry.object[entry.property] = entry.value; entry.after?.(); }
  }
}

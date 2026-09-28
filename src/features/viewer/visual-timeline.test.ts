import { describe, expect, it } from "vitest";
import { AmbientLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, SphereGeometry } from "three";
import { defaultProjectSnapshot, parseProjectSnapshot } from "@/features/projects/domain/project-state";
import { indexSceneParts } from "@/features/projects/ui/scene-parts";
import { VisualTimelinePlayer, type VisualTimeline } from "./visual-timeline";

const id = () => crypto.randomUUID();
function fixture() {
  const root = new Group();
  const mesh = new Mesh(new SphereGeometry(1), new MeshStandardMaterial({ opacity: 1, roughness: 0.5 }));
  mesh.name = "Face"; mesh.morphTargetInfluences = [0.2]; root.add(mesh);
  const partId = indexSceneParts(root)[0].id;
  const camera = new PerspectiveCamera(45);
  const light = new AmbientLight("white", 1);
  return { root, mesh, partId, camera, light, lights: { ambient: light } };
}
function timeline(): VisualTimeline { return { id: id(), name: "Intro", enabled: true, durationSeconds: 2, trigger: { type: "start", targetId: null }, tracks: [] }; }
function track(target: VisualTimeline["tracks"][number]["target"], targetId: string, property: VisualTimeline["tracks"][number]["property"], from: number, to: number): VisualTimeline["tracks"][number] {
  return { id: id(), target, targetId, property, keyframes: [{ at: 0, value: from }, { at: 2, value: to }] };
}

describe("visual timeline", () => {
  it("serializes typed tracks and rejects code, invalid pairs, and bad timing", () => {
    const spec = timeline(); spec.tracks.push(track("part", "face", "position.x", 0, 3));
    const snapshot = defaultProjectSnapshot(); snapshot.animation.timelines = [spec];
    expect(parseProjectSnapshot(JSON.parse(JSON.stringify(snapshot))).animation.timelines).toEqual([spec]);
    expect(() => parseProjectSnapshot({ ...snapshot, animation: { ...snapshot.animation, timelines: [{ ...spec, tracks: [{ ...spec.tracks[0], property: "eval" }] }] } })).toThrow();
    expect(() => parseProjectSnapshot({ ...snapshot, animation: { ...snapshot.animation, timelines: [{ ...spec, tracks: [{ ...spec.tracks[0], property: "opacity" }] }] } })).toThrow();
    expect(() => parseProjectSnapshot({ ...snapshot, animation: { ...snapshot.animation, timelines: [{ ...spec, tracks: [{ ...spec.tracks[0], keyframes: [{ at: 1, value: 0 }, { at: 2, value: 3 }] }] }] } })).toThrow();
  });

  it("scrubs every target class, warns on missing targets, and restores values on teardown", () => {
    const { root, mesh, partId, camera, light, lights } = fixture();
    const spec = timeline();
    spec.tracks = [
      track("part", partId, "position.x", 0, 4),
      track("material", partId, "opacity", 1, 0.5),
      track("camera", "main", "fov", 45, 70),
      track("light", "ambient", "intensity", 1, 2),
      track("morph", `${partId}:0`, "influence", 0.2, 0.8),
      track("part", "missing", "position.y", 0, 1),
    ];
    const player = new VisualTimelinePlayer(spec, root, camera, lights);
    player.seek(0.5);
    expect(mesh.position.x).toBeCloseTo(2);
    expect((mesh.material as MeshStandardMaterial).opacity).toBeCloseTo(0.75);
    expect(camera.fov).toBeCloseTo(57.5);
    expect(light.intensity).toBeCloseTo(1.5);
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5);
    expect(player.warnings).toContain("Unavailable part target missing for position.y.");
    player.dispose();
    expect(mesh.position.x).toBe(0);
    expect((mesh.material as MeshStandardMaterial).opacity).toBe(1);
    expect(camera.fov).toBe(45);
    expect(light.intensity).toBe(1);
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.2);
    const reopened = new VisualTimelinePlayer(spec, root, camera, lights);
    reopened.seek(0.5);
    expect(mesh.position.x).toBeCloseTo(2);
    reopened.dispose();
    expect(mesh.position.x).toBe(0);
  });

  it("matches every trigger and respects reduced motion", () => {
    const { root, partId, camera, lights, mesh } = fixture();
    for (const type of ["start", "scroll", "click", "hover", "model-loaded", "clip-start", "clip-end"] as const) {
      const spec = timeline(); spec.trigger = { type, targetId: type === "click" || type === "hover" || type.startsWith("clip-") ? partId : null };
      spec.tracks = [track("part", partId, "position.x", 0, 2)];
      const player = new VisualTimelinePlayer(spec, root, camera, lights, true);
      expect(mesh.position.x).toBe(2);
      expect(player.fire(type, spec.trigger.targetId)).toBe(true);
      expect(player.fire(type, "wrong")).toBe(spec.trigger.targetId === null);
      player.dispose();
    }
  });
});

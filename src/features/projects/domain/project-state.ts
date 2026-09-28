import { z } from "zod";

export const projectStepNames = ["Import", "Analyze", "Optimize", "Appearance", "Scene", "Interactions", "Animate", "Export"] as const;
export type ProjectStepName = typeof projectStepNames[number];
export type ProjectStepStatus = "not-started" | "in-progress" | "complete" | "warning" | "processing";

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a six-digit hex color.");
const Vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const AppearanceOverride = z.object({
  visible: z.boolean().optional(), position: Vector3.optional(), rotation: Vector3.optional(), scale: Vector3.optional(),
  color: hexColor.optional(), opacity: z.number().min(0).max(1).optional(), roughness: z.number().min(0).max(1).optional(), metalness: z.number().min(0).max(1).optional(),
  materialSourceNodeId: z.string().min(1).optional(), textureSourceNodeId: z.union([z.string().min(1), z.null()]).optional(),
}).strict();
const SceneSettings = z.object({
  background: hexColor, environment: z.enum(["none", "studio", "outdoor"]), exposure: z.number().min(-5).max(5),
  camera: z.object({ position: Vector3, target: Vector3, fov: z.number().min(1).max(170) }).strict(), shadows: z.boolean(),
  controls: z.enum(["orbit", "turntable", "disabled"]), reducedMotion: z.boolean(),
}).strict();
const Interaction = z.object({
  id: z.string().min(1), targetNodeId: z.string().min(1), trigger: z.enum(["click", "hover", "hotspot"]),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("toggle-visibility") }).strict(),
    z.object({ type: z.literal("focus-camera"), cameraTargetId: z.string().min(1) }).strict(),
    z.object({ type: z.literal("play-clip"), clipId: z.string().min(1) }).strict(),
    z.object({ type: z.literal("show-annotation"), annotation: z.string().min(1).max(2000) }).strict(),
  ]),
}).strict();
const EmbeddedClip = z.object({
  id: z.string().uuid(), sourceIndex: z.number().int().min(0), name: z.string().min(1).max(120),
  enabled: z.boolean(), trimStart: z.number().min(0).finite(), trimEnd: z.number().positive().finite(),
  speed: z.number().min(0.05).max(8).finite(), loop: z.enum(["once", "repeat", "pingpong"]),
}).strict().refine((clip) => clip.trimEnd > clip.trimStart, "Trim end must follow trim start.");
const ImportedTrack = z.object({
  sourceTarget: z.string().min(1).max(200), targetNode: z.string().min(1).max(200).nullable(),
  path: z.enum(["position", "quaternion", "rotation", "scale", "weights"]),
  component: z.string().regex(/^(?:[xyzw]|\d+)$/).nullable(),
  status: z.enum(["matched", "manual", "ambiguous", "missing"]), times: z.array(z.number().finite()).max(2000), values: z.array(z.number().finite()).max(6000),
}).strict();
const ImportedMapping = z.object({
  sourceBone: z.string().min(1).max(200), targetBone: z.string().min(1).max(200).nullable(),
  status: z.enum(["matched", "manual", "ambiguous", "missing"]),
}).strict();
const ImportedClip = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(120), sourceFileName: z.string().min(1).max(240),
  sourceClipIndex: z.number().int().min(0).max(199),
  sourceStorageKey: z.string().min(1).max(500), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  durationSeconds: z.number().positive().finite(), trimStart: z.number().min(0).finite(), trimEnd: z.number().positive().finite(), speed: z.number().min(0.05).max(8).finite(), loop: z.enum(["once", "repeat", "pingpong"]), tracks: z.array(ImportedTrack).max(500), mapping: z.array(ImportedMapping).max(500), enabled: z.boolean(),
}).strict().refine((clip) => clip.trimEnd > clip.trimStart, "Imported clip trim end must follow trim start.").refine((clip) => clip.mapping.every((entry) => entry.targetBone && entry.status !== "missing" && entry.status !== "ambiguous") && clip.tracks.every((entry) => entry.targetNode && entry.status !== "missing" && entry.status !== "ambiguous"), "Imported clip mapping must be resolved before attachment.");

export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(1), appearance: z.object({ nodes: z.record(z.string(), AppearanceOverride) }).strict(), scene: SceneSettings,
  interactions: z.array(Interaction).max(200), animation: z.object({ embeddedClips: z.array(EmbeddedClip).max(200), importedClips: z.array(ImportedClip).max(200), clips: z.array(z.record(z.string(), z.unknown())).max(200), timelines: z.array(z.record(z.string(), z.unknown())).max(50) }).strict(),
  export: z.object({ loadingPolicy: z.enum(["on-demand", "metadata-first", "critical-assets", "full-preload"]), criticalAssetIds: z.array(z.string()).max(500) }).strict(),
}).strict();
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

export function defaultProjectSnapshot(): ProjectSnapshot {
  return { schemaVersion: 1, appearance: { nodes: {} }, scene: { background: "#111417", environment: "studio", exposure: 0, camera: { position: [3, 2, 5], target: [0, 0, 0], fov: 45 }, shadows: true, controls: "orbit", reducedMotion: false }, interactions: [], animation: { embeddedClips: [], importedClips: [], clips: [], timelines: [] }, export: { loadingPolicy: "metadata-first", criticalAssetIds: [] } };
}

function migrateLegacy(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultProjectSnapshot();
  const value = input as Record<string, unknown>; const defaults = defaultProjectSnapshot();
  if (typeof value.schemaVersion === "number" && value.schemaVersion > 1) return input;
  const scene = value.scene && typeof value.scene === "object" ? value.scene as Record<string, unknown> : {};
  const camera = scene.camera && typeof scene.camera === "object" ? scene.camera as Record<string, unknown> : {};
  return { ...defaults, ...value, schemaVersion: 1, appearance: { ...defaults.appearance, ...(value.appearance && typeof value.appearance === "object" ? value.appearance : {}) }, scene: { ...defaults.scene, ...scene, camera: { ...defaults.scene.camera, ...camera } }, interactions: Array.isArray(value.interactions) ? value.interactions : defaults.interactions, animation: { ...defaults.animation, ...(value.animation && typeof value.animation === "object" ? value.animation : {}) }, export: { ...defaults.export, ...(value.export && typeof value.export === "object" ? value.export : {}) } };
}

export function parseProjectSnapshot(input: unknown): ProjectSnapshot { return ProjectSnapshotSchema.parse(migrateLegacy(input)); }
export function isProjectStepName(value: unknown): value is ProjectStepName { return typeof value === "string" && (projectStepNames as readonly string[]).includes(value); }

import { AnimationClip, Bone, Group, NumberKeyframeTrack, Object3D, PropertyBinding, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import type { AssetAnalysis } from "@/features/assets/domain/types";

export type MappingStatus = "matched" | "manual" | "ambiguous" | "missing";
export type ImportedMapping = { sourceBone: string; targetBone: string | null; status: MappingStatus; candidates: string[] };
export type ImportedTrack = { sourceTarget: string; targetNode: string | null; path: "position" | "quaternion" | "rotation" | "scale" | "weights"; component: string | null; status: MappingStatus; times: number[]; values: number[] };
export type ImportedClipAnalysis = {
  name: string; durationSeconds: number; mapping: ImportedMapping[]; tracks: Array<ImportedTrack & { candidates: string[] }>;
  compatible: boolean; warnings: string[]; problems: string[]; candidateProblems: Record<string, Record<string, string[]>>; manualMapping?: Record<string, string>;
};
export type ImportedClipAttachment = ProjectSnapshot["animation"]["importedClips"][number];
export type ImportedAnimationManifest = {
  name?: string;
  durationSeconds?: number;
  tracks: Array<{ target: string; path: ImportedTrack["path"]; times: number[]; values: number[] }>;
};
export type ImportedAnimationSource = { clip: AnimationClip; root: Object3D; sourceClipIndex: number };

function canonical(value: string): string {
  const suffix = value.split(":").at(-1) ?? value;
  return suffix.replace(/[^a-z0-9]/gi, "").toLowerCase().replace(/^mixamorig/, "");
}

function sceneNames(root: Object3D): string[] {
  const names: string[] = [];
  root.traverse((node) => { if (node.name) names.push(node.name); });
  return [...new Set(names)];
}

function candidates(source: string, names: string[]): string[] {
  const exact = names.filter((name) => name === source || name.split(":").at(-1) === source.split(":").at(-1));
  if (exact.length) return exact;
  const key = canonical(source);
  const normalized = names.filter((name) => canonical(name) === key);
  if (normalized.length) return normalized;
  return names.filter((name) => canonical(name).startsWith(key) || key.startsWith(canonical(name)));
}

function trackBinding(trackName: string): Pick<ImportedTrack, "sourceTarget" | "path" | "component"> {
  const match = /^(.+)\.(position|quaternion|rotation|scale|morphTargetInfluences)(?:\[([^\]]+)\])?$/.exec(trackName);
  if (!match || !/^(?:[xyzw]|\d+)$/.test(match[3] ?? "x")) throw new Error(`Unsupported animation track: ${trackName}`);
  return { sourceTarget: match[1], path: match[2] === "morphTargetInfluences" ? "weights" : match[2] as ImportedTrack["path"], component: match[3] ?? null };
}

export function animationClipFromManifest(input: unknown): AnimationClip {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Animation manifest must be an object.");
  const value = input as Partial<ImportedAnimationManifest>;
  if (!Array.isArray(value.tracks) || !value.tracks.length) throw new Error("Animation manifest needs at least one track.");
  const tracks = value.tracks.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.target !== "string" || !entry.target.trim() || !Array.isArray(entry.times) || !Array.isArray(entry.values)) throw new Error("Animation manifest contains an invalid track.");
    if (!["position", "quaternion", "rotation", "scale", "weights"].includes(entry.path)) throw new Error("Animation manifest contains an unsupported track path.");
    if (!entry.times.length || entry.times.some((time) => typeof time !== "number" || !Number.isFinite(time) || time < 0) || entry.values.some((number) => typeof number !== "number" || !Number.isFinite(number))) throw new Error("Animation manifest contains invalid keyframe data.");
    if (entry.path === "position" || entry.path === "scale") {
      if (entry.values.length !== entry.times.length * 3) throw new Error("Vector tracks need three values per keyframe.");
      return new VectorKeyframeTrack(`${entry.target}.${entry.path}`, entry.times, entry.values);
    }
    if (entry.path === "quaternion") {
      if (entry.values.length !== entry.times.length * 4) throw new Error("Quaternion tracks need four values per keyframe.");
      return new QuaternionKeyframeTrack(`${entry.target}.${entry.path}`, entry.times, entry.values);
    }
    if (entry.values.length !== entry.times.length) throw new Error("Scalar tracks need one value per keyframe.");
    return new NumberKeyframeTrack(`${entry.target}.${entry.path === "weights" ? "morphTargetInfluences" : entry.path}`, entry.times, entry.values);
  });
  const duration = typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0
    ? value.durationSeconds : Math.max(0.001, ...tracks.map((track) => track.times.at(-1) ?? 0));
  return new AnimationClip(typeof value.name === "string" && value.name.trim() ? value.name.trim() : "Imported clip", duration, tracks);
}

export function targetRootFromNames(names: string[]): Object3D {
  const root = new Group();
  root.userData.rigKnown = false;
  for (const name of names) { const node = new Object3D(); node.name = PropertyBinding.sanitizeNodeName(name); root.add(node); }
  return root;
}

export function targetRootFromParts(parts: Array<{ name: string; type: string; parentName?: string; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }>): Object3D {
  const root = new Group();
  const nodes = parts.map((part) => {
    const node = part.type === "Bone" ? new Bone() : new Object3D();
    node.name = part.name;
    node.position.fromArray(part.position);
    node.rotation.set(...part.rotation);
    node.scale.fromArray(part.scale);
    return node;
  });
  nodes.forEach((node, index) => { const parent = nodes.find((candidate) => candidate.name === parts[index].parentName); (parent && parent !== node ? parent : root).add(node); });
  return root;
}

export function targetRootFromRigNodes(rigNodes: NonNullable<AssetAnalysis["rigNodes"]>): Object3D {
  const root = new Group();
  const nodes = rigNodes.map((part) => {
    const node = part.isBone ? new Bone() : new Object3D();
    node.name = PropertyBinding.sanitizeNodeName(part.name);
    node.position.fromArray(part.position);
    node.quaternion.fromArray(part.rotation);
    node.scale.fromArray(part.scale);
    return node;
  });
  nodes.forEach((node, index) => {
    const parentName = rigNodes[index].parentName;
    const parent = parentName ? nodes.find((candidate) => candidate.name === PropertyBinding.sanitizeNodeName(parentName)) : undefined;
    (parent && parent !== node ? parent : root).add(node);
  });
  return root;
}

export async function parseImportedAnimationSource(bytes: Uint8Array, fileName: string, sourceClipIndex = 0): Promise<ImportedAnimationSource> {
  const extension = fileName.toLowerCase().split(".").at(-1);
  if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Animation source must be between 1 byte and 8 MB.");
  if (extension === "json" || extension === "ygganimation") {
    if (sourceClipIndex !== 0) throw new Error("Animation manifest has one clip.");
    const clip = animationClipFromManifest(JSON.parse(new TextDecoder().decode(bytes)));
    const root = targetRootFromNames([...new Set(clip.tracks.map((track) => trackBinding(track.name).sourceTarget))]);
    return { clip, root, sourceClipIndex };
  }
  if (extension !== "glb" && extension !== "gltf") throw new Error("Import a self-contained GLB, glTF, or animation manifest.");
  let jsonBytes = bytes;
  if (extension === "glb") {
    if (bytes.byteLength < 20) throw new Error("Invalid GLB animation source.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("Invalid GLB animation source.");
    jsonBytes = bytes.subarray(20, 20 + view.getUint32(12, true));
  }
  const document = JSON.parse(new TextDecoder().decode(jsonBytes)) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
  for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) if (resource.uri && !resource.uri.startsWith("data:")) throw new Error("Animation glTF must be self-contained.");
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(extension === "glb" ? data : new TextDecoder().decode(bytes), "");
  const clip = gltf.animations[sourceClipIndex];
  if (!clip) throw new Error(`Animation clip ${sourceClipIndex} is unavailable.`);
  if (!clip.tracks.length || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error("Animation clip has no playable keyframes.");
  return { clip, root: gltf.scene, sourceClipIndex };
}

export function analyzeImportedClip(clip: AnimationClip, _sourceRoot: Object3D, targetRoot: Object3D): ImportedClipAnalysis {
  const targetNames = sceneNames(targetRoot);
  const sourceTargets = [...new Set(clip.tracks.map((track) => trackBinding(track.name).sourceTarget))];
  const mapping = sourceTargets.map((sourceBone) => {
    const found = candidates(sourceBone, targetNames);
    return { sourceBone, targetBone: found.length === 1 ? found[0] : null, status: found.length === 1 ? "matched" as const : found.length ? "ambiguous" as const : "missing" as const, candidates: found };
  });
  const bySource = new Map(mapping.map((entry) => [entry.sourceBone, entry]));
  const tracks = clip.tracks.map((track) => {
    const binding = trackBinding(track.name);
    const sourceTarget = binding.sourceTarget;
    const entry = bySource.get(sourceTarget)!;
    return { ...binding, targetNode: entry.targetBone, status: entry.status, candidates: entry.candidates, times: [...track.times], values: [...track.values] };
  });
  const warnings: string[] = [];
  const problems: string[] = [];
  const candidateProblems: Record<string, Record<string, string[]>> = {};
  if (_sourceRoot.userData.rigKnown !== false && targetRoot.userData.rigKnown !== false) for (const entry of mapping) {
    const source = _sourceRoot.getObjectByName(entry.sourceBone);
    if (!source) { problems.push(`Source rig target unavailable: ${entry.sourceBone}`); continue; }
    candidateProblems[entry.sourceBone] = {};
    for (const name of entry.candidates) {
      const target = targetRoot.getObjectByName(name)!;
      const issues: string[] = [];
      if (source instanceof Bone && !(target instanceof Bone)) issues.push(`Bone ${entry.sourceBone} maps to a non-bone target ${target.name}.`);
      const sourceParent = source.parent instanceof Bone ? source.parent : null;
      const targetParent = target.parent instanceof Bone ? target.parent : null;
      if (sourceParent && (!targetParent || canonical(sourceParent.name) !== canonical(targetParent.name))) issues.push(`Bone hierarchy differs at ${entry.sourceBone}: expected parent ${sourceParent.name}.`);
      candidateProblems[entry.sourceBone][name] = issues;
      if (name === entry.targetBone) {
        problems.push(...issues);
        if (source.position.distanceTo(target.position) > 0.05 || Math.abs(source.quaternion.dot(target.quaternion)) < 0.99 || source.scale.distanceTo(target.scale) > 0.05) warnings.push(`Rest transform differs for ${entry.sourceBone}; preview the motion before attaching.`);
      }
    }
  }
  return { name: clip.name || "Imported clip", durationSeconds: Math.max(0.001, clip.duration), mapping, tracks, warnings, problems, candidateProblems, compatible: mapping.every((entry) => entry.status === "matched") && problems.length === 0 };
}

export function attachImportedClip(analysis: ImportedClipAnalysis & { manualMapping?: Record<string, string> }, source: { id: string; sourceFileName: string; sourceStorageKey: string; sourceSha256: string; sourceClipIndex?: number }): ImportedClipAttachment {
  if (analysis.problems.length) throw new Error(analysis.problems.join(" "));
  const mapping = analysis.mapping.map((entry) => {
    const manual = analysis.manualMapping?.[entry.sourceBone];
    if (manual && entry.candidates.includes(manual)) return { ...entry, targetBone: manual, status: "manual" as const };
    return entry;
  });
  const bySource = new Map(mapping.map((entry) => [entry.sourceBone, entry]));
  if (mapping.some((entry) => entry.status === "missing" || entry.status === "ambiguous" || !entry.targetBone)) throw new Error(`Imported clip mapping is unresolved: ${mapping.filter((entry) => entry.status !== "matched" && entry.status !== "manual").map((entry) => `${entry.status} ${entry.sourceBone}`).join(", ")}`);
  const selectedProblems = mapping.flatMap((entry) => entry.targetBone ? analysis.candidateProblems[entry.sourceBone]?.[entry.targetBone] ?? [] : []);
  if (selectedProblems.length) throw new Error(selectedProblems.join(" "));
  const tracks = analysis.tracks.map((track) => {
    const entry = bySource.get(track.sourceTarget)!;
    return { sourceTarget: track.sourceTarget, targetNode: entry.targetBone, path: track.path, component: track.component, status: entry.status, times: track.times, values: track.values };
  });
  return { id: source.id as ImportedClipAttachment["id"], name: analysis.name, sourceFileName: source.sourceFileName, sourceClipIndex: source.sourceClipIndex ?? 0, sourceStorageKey: source.sourceStorageKey, sourceSha256: source.sourceSha256, durationSeconds: analysis.durationSeconds, trimStart: 0, trimEnd: analysis.durationSeconds, speed: 1, loop: "repeat", tracks, mapping: mapping.map(({ sourceBone, targetBone, status }) => ({ sourceBone, targetBone, status })), enabled: true };
}

export function importedClipAnimation(clip: ImportedClipAttachment): AnimationClip {
  const tracks = clip.tracks.flatMap((track) => {
    if (!track.targetNode) return [];
    const name = `${track.targetNode}.${track.path === "weights" ? "morphTargetInfluences" : track.path}${track.component === null ? "" : `[${track.component}]`}`;
    if (track.component !== null) return [new NumberKeyframeTrack(name, track.times, track.values)];
    if (track.path === "quaternion") return [new QuaternionKeyframeTrack(name, track.times, track.values)];
    if (track.path === "position" || track.path === "scale") return [new VectorKeyframeTrack(name, track.times, track.values)];
    return [new NumberKeyframeTrack(name, track.times, track.values)];
  });
  return new AnimationClip(clip.name, clip.durationSeconds, tracks);
}

export function playableImportedClip(source: AnimationClip, attached: ImportedClipAttachment): AnimationClip {
  const mapping = new Map(attached.mapping.map((entry) => [entry.sourceBone, entry.targetBone]));
  const tracks = source.tracks.flatMap((track) => {
    const sourceTarget = trackBinding(track.name).sourceTarget;
    const target = mapping.get(sourceTarget);
    if (!target) return [];
    const suffix = track.name.slice(sourceTarget.length);
    const clone = track.clone();
    clone.name = `${target}${suffix}`;
    return [clone];
  });
  return new AnimationClip(attached.name, source.duration, tracks);
}

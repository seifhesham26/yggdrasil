import { readFile } from "node:fs/promises";
import { extname, posix } from "node:path";
import { getBounds, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureAVIF, EXTTextureWebP, KHRMeshQuantization, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import type { AssetAnalysis } from "../domain/types";
import { AssetImportError } from "../domain/errors";

type Warning = AssetAnalysis["warnings"][number];
const supportedExtensions = new Set([
  ...KHRONOS_EXTENSIONS.map((extension) => extension.EXTENSION_NAME),
  EXTMeshoptCompression.EXTENSION_NAME,
  EXTTextureAVIF.EXTENSION_NAME,
  EXTTextureWebP.EXTENSION_NAME,
  KHRMeshQuantization.EXTENSION_NAME,
]);

export function rawGltfJson(bytes: Uint8Array, format: "gltf" | "glb"): Record<string, unknown> {
  let jsonBytes = bytes;
  if (format === "glb") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) {
      throw new Error("Invalid GLB JSON chunk");
    }
    const length = view.getUint32(12, true);
    if (20 + length > bytes.length) throw new Error("Truncated GLB JSON chunk");
    jsonBytes = bytes.subarray(20, 20 + length);
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(jsonBytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid glTF JSON document");
  return parsed as Record<string, unknown>;
}

function extensionNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").sort() : [];
}

export function validateResourceUris(value: unknown, storage: AssetStorage, primaryKey: StorageKey): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => validateResourceUris(item, storage, primaryKey));
    return;
  }
  for (const [field, child] of Object.entries(value)) {
    if (field !== "uri") {
      validateResourceUris(child, storage, primaryKey);
      continue;
    }
    if (typeof child !== "string") throw new AssetImportError("INVALID_PATH", "Invalid glTF resource URI");
    if (child.startsWith("data:") && /^data:[^,]*;base64,/.test(child)) continue;
    if (!child || child.startsWith("/") || child.includes("\\") || child.includes(":") || child.includes("%") || child.includes("?") || child.includes("#") || /[\x00-\x1f\x7f]/.test(child)) {
      throw new AssetImportError("INVALID_PATH", `Unsafe glTF resource URI: ${child}`);
    }
    const combined = posix.normalize(posix.join(posix.dirname(primaryKey), child));
    try {
      storage.processingPath(parseStorageKey(combined));
    } catch {
      throw new AssetImportError("INVALID_PATH", `Resource URI escapes storage: ${child}`);
    }
  }
}

export async function analyzeGltf(storage: AssetStorage, primaryKey: StorageKey): Promise<AssetAnalysis> {
  const format = extname(primaryKey).toLowerCase().slice(1);
  if (format !== "gltf" && format !== "glb") throw new Error("Only glTF and GLB can be analyzed");
  const path = storage.processingPath(primaryKey);
  const metadata = rawGltfJson(await readFile(path), format);
  validateResourceUris(metadata, storage, primaryKey);
  const extensionsUsed = extensionNames(metadata.extensionsUsed);
  const required = extensionNames(metadata.extensionsRequired);
  const warnings: Warning[] = required.filter((name) => !supportedExtensions.has(name)).map((name) => ({
    code: "UNSUPPORTED_REQUIRED_EXTENSION", severity: "error", message: `Required extension ${name} is not supported; analysis may be incomplete.`,
  }));
  EXTTextureWebP.register();
  EXTTextureAVIF.register();
  const { MeshoptDecoder } = await import("meshoptimizer");
  await MeshoptDecoder.ready;
  const io = new NodeIO().setStrictResources(false).registerExtensions([
    ...KHRONOS_EXTENSIONS,
    EXTMeshoptCompression,
    EXTTextureAVIF,
    EXTTextureWebP,
    KHRMeshQuantization,
  ]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const jsonDocument = await io.readAsJSON(path);
  // Keep the source untouched. Removing only unknown required declarations from
  // the parser's in-memory copy allows a partial inspection with a clear warning.
  if (warnings.some((warning) => warning.code === "UNSUPPORTED_REQUIRED_EXTENSION")) {
    jsonDocument.json.extensionsRequired = required.filter((name) => supportedExtensions.has(name));
  }
  const document = await io.readJSON(jsonDocument);
  const root = document.getRoot();
  const scenes = root.listScenes();
  const meshes = root.listMeshes();
  const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
  const nodes = root.listNodes();
  const joints = new Set(root.listSkins().flatMap((skin) => skin.listJoints()));
  const animations = root.listAnimations().map((animation, sourceIndex) => {
    const name = animation.getName();
    if (!name) warnings.push({ code: "UNNAMED_ANIMATION", severity: "info", message: "An animation clip has no name." });
    let durationSeconds = 0;
    for (const sampler of animation.listSamplers()) {
      const input = sampler.getInput();
      if (input && input.getCount()) {
        const start = input.getMin([])[0];
        const end = input.getMax([])[0];
        if (Number.isFinite(start) && Number.isFinite(end)) durationSeconds = Math.max(durationSeconds, end - start);
      }
    }
    const channels = animation.listChannels();
    const targets = channels.map((channel) => ({ nodeName: channel.getTargetNode()?.getName() || "(unnamed)", path: channel.getTargetPath() ?? "unknown" }));
    return { name, durationSeconds, channels: channels.length, sourceIndex, targets,
      usesSkeleton: channels.some((channel) => joints.has(channel.getTargetNode()!)),
      usesMorph: targets.some((target) => target.path === "weights") };
  });
  for (const mesh of meshes) {
    if (!mesh.getName()) warnings.push({ code: "UNNAMED_MESH", severity: "info", message: "A mesh has no name." });
  }
  for (const texture of root.listTextures()) {
    if (!texture.getImage()) warnings.push({ code: "MISSING_TEXTURE", severity: "warning", message: `Texture ${texture.getName() || texture.getURI() || "(unnamed)"} has no image data.` });
    const size = texture.getSize();
    if (size && (size[0] > 4096 || size[1] > 4096)) warnings.push({ code: "LARGE_TEXTURE", severity: "warning", message: `Texture ${texture.getName() || texture.getURI() || "(unnamed)"} exceeds 4096 pixels.` });
  }
  const triangles = primitives.reduce((total, primitive) => {
    const drawCount = primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
    const mode = primitive.getMode();
    return total + (mode === 4 ? Math.floor(drawCount / 3) : mode === 5 || mode === 6 ? Math.max(0, drawCount - 2) : 0);
  }, 0);
  if (triangles > 250_000) warnings.push({ code: "HIGH_TRIANGLE_COUNT", severity: "warning", message: `Model contains ${triangles} triangles.` });
  const boundsByScene = scenes.map((scene) => getBounds(scene));
  const finiteBounds = boundsByScene.filter((bounds) => [...bounds.min, ...bounds.max].every(Number.isFinite));
  const bounds = finiteBounds.length ? {
    min: [0, 1, 2].map((index) => Math.min(...finiteBounds.map((item) => item.min[index]))) as [number, number, number],
    max: [0, 1, 2].map((index) => Math.max(...finiteBounds.map((item) => item.max[index]))) as [number, number, number],
  } : null;
  const rawExtensions = metadata.extensions && typeof metadata.extensions === "object" ? metadata.extensions as Record<string, unknown> : {};
  const punctual = rawExtensions.KHR_lights_punctual && typeof rawExtensions.KHR_lights_punctual === "object"
    ? rawExtensions.KHR_lights_punctual as Record<string, unknown> : {};
  const lightCount = Array.isArray(punctual.lights) ? punctual.lights.length : 0;
  warnings.sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
  return {
    format,
    counts: {
      scenes: scenes.length,
      nodes: nodes.length,
      meshes: meshes.length,
      primitives: primitives.length,
      vertices: primitives.reduce((total, primitive) => total + (primitive.getAttribute("POSITION")?.getCount() ?? 0), 0),
      triangles,
      materials: root.listMaterials().length,
      textures: root.listTextures().length,
      skins: root.listSkins().length,
      morphTargets: primitives.reduce((total, primitive) => total + primitive.listTargets().length, 0),
      cameras: root.listCameras().length,
      lights: lightCount,
      animations: animations.length,
    },
    bounds,
    animations,
    nodeNames: nodes.map((node) => node.getName()).filter(Boolean).sort(),
    extensionsUsed,
    warnings,
  };
}

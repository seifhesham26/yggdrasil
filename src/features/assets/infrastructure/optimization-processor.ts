import { dedup, meshopt, prune, simplify, textureCompress } from "@gltf-transform/functions";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureAVIF, EXTTextureWebP, KHRONOS_EXTENSIONS, KHRMeshQuantization } from "@gltf-transform/extensions";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import { optimizationWarnings, type OptimizationOperation } from "../domain/optimization";
import type { OptimizationSettings } from "../application/reversible-optimization";
import { rawGltfJson, validateResourceUris } from "./gltf-analyzer";

export type OptimizationOutput = { bytes: Uint8Array; mimeType: "model/gltf-binary"; warnings: Array<{ code: string; message: string }> };

function validateSettings(operation: OptimizationOperation, settings: OptimizationSettings): void {
  if (typeof settings.keepExtras !== "boolean") throw new Error("Invalid optimization settings: keepExtras must be boolean.");
  if (operation === "resize-textures") {
    if (!Number.isInteger(settings.maxTextureSize) || settings.maxTextureSize! < 1 || settings.maxTextureSize! > 16384) throw new Error("Invalid texture size: expected a positive integer up to 16384.");
    if (settings.targetFormat && !["jpeg", "png", "webp", "avif"].includes(settings.targetFormat)) throw new Error("Invalid texture format.");
  }
  if (settings.quality !== undefined && (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100)) throw new Error("Invalid texture quality: expected an integer between 1 and 100.");
  if (operation === "compress-geometry" && settings.meshoptLevel && !["medium", "high"].includes(settings.meshoptLevel)) throw new Error("Invalid meshopt level.");
  if (operation === "lower-detail") {
    if (settings.detailRatio !== undefined && (!Number.isFinite(settings.detailRatio) || settings.detailRatio <= 0 || settings.detailRatio >= 1)) throw new Error("Invalid detail ratio: expected a value between 0 and 1.");
    if (settings.detailError !== undefined && (!Number.isFinite(settings.detailError) || settings.detailError <= 0)) throw new Error("Invalid detail error: expected a positive number.");
  }
}

export async function processOptimization(storage: AssetStorage, inputKey: StorageKey, operation: OptimizationOperation, settings: OptimizationSettings = { keepExtras: true }): Promise<OptimizationOutput> {
  if (!["normalize", "remove-unused", "resize-textures", "compress-geometry", "lower-detail"].includes(operation)) throw new Error(`Unsupported optimization operation: ${operation}`);
  validateSettings(operation, settings);
  const metadata = rawGltfJson(await storage.read(inputKey), inputKey.toLowerCase().endsWith(".glb") ? "glb" : "gltf");
  validateResourceUris(metadata, storage, inputKey);
  const names = new Set<string>();
  function collectExtensions(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === "extensionsUsed" || key === "extensionsRequired") && Array.isArray(child)) child.forEach((name) => names.add(String(name)));
      else if (key === "extensions" && child && typeof child === "object") Object.keys(child).forEach((name) => names.add(name));
      else collectExtensions(child);
    }
  }
  collectExtensions(metadata);
  const blockers = optimizationWarnings({ extensionsUsed: [...names], warnings: [] });
  if (blockers.length) throw new Error(blockers.join(" "));
  let io = new NodeIO().setStrictResources(true).registerExtensions([
    ...KHRONOS_EXTENSIONS,
    EXTMeshoptCompression,
    EXTTextureAVIF,
    EXTTextureWebP,
    KHRMeshQuantization,
  ]);
  if (operation === "compress-geometry") {
    const { MeshoptEncoder, MeshoptDecoder } = await import("meshoptimizer");
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    io = io.registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  }
  EXTTextureWebP.register();
  EXTTextureAVIF.register();
  const document = await io.read(storage.processingPath(inputKey));
  // Preserve UVs, material textures and metadata; these are not appearance edits.
  await document.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true, keepExtras: settings.keepExtras }));
  if (operation === "normalize") await document.transform(dedup());
  if (operation === "resize-textures") {
    const { default: sharp } = await import("sharp");
    await document.transform(textureCompress({
      encoder: sharp,
      resize: [settings.maxTextureSize!, settings.maxTextureSize!],
      targetFormat: settings.targetFormat,
      quality: settings.quality,
    }));
  }
  if (operation === "compress-geometry") {
    const { MeshoptEncoder } = await import("meshoptimizer");
    await MeshoptEncoder.ready;
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: settings.meshoptLevel ?? "high" }));
  }
  if (operation === "lower-detail") {
    const { MeshoptSimplifier } = await import("meshoptimizer");
    await MeshoptSimplifier.ready;
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: settings.detailRatio ?? 0.5, error: settings.detailError ?? 0.01 }));
  }
  const bytes = await io.writeBinary(document);
  const reopened = await io.readBinary(bytes);
  const retained = new Set(reopened.getRoot().listExtensionsUsed().map((extension) => extension.extensionName));
  if ([...names].some((name) => !retained.has(name))) throw new Error("Extension fidelity validation failed; output was not retained.");
  return { bytes, mimeType: "model/gltf-binary", warnings: [] };
}

export function optimizedStorageKey(assetId: string, versionId: string): StorageKey {
  return parseStorageKey(`assets/${assetId}/versions/${versionId}/model.glb`);
}

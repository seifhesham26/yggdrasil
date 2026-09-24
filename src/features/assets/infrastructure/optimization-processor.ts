import { dedup, prune } from "@gltf-transform/functions";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import { optimizationWarnings, type OptimizationOperation } from "../domain/optimization";
import type { OptimizationSettings } from "../application/reversible-optimization";
import { rawGltfJson, validateResourceUris } from "./gltf-analyzer";

export type OptimizationOutput = { bytes: Uint8Array; mimeType: "model/gltf-binary"; warnings: Array<{ code: string; message: string }> };

export async function processOptimization(storage: AssetStorage, inputKey: StorageKey, operation: OptimizationOperation, settings: OptimizationSettings = { keepExtras: true }): Promise<OptimizationOutput> {
  if (operation !== "normalize" && operation !== "remove-unused") {
    throw new Error(`Unsupported optimization operation: ${operation}`);
  }
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
  const io = new NodeIO().setStrictResources(true).registerExtensions(KHRONOS_EXTENSIONS);
  const document = await io.read(storage.processingPath(inputKey));
  // Preserve UVs, material textures and metadata; these are not appearance edits.
  await document.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true, keepExtras: settings.keepExtras }));
  if (operation === "normalize") await document.transform(dedup());
  const bytes = await io.writeBinary(document);
  const reopened = await io.readBinary(bytes);
  const retained = new Set(reopened.getRoot().listExtensionsUsed().map((extension) => extension.extensionName));
  if ([...names].some((name) => !retained.has(name))) throw new Error("Extension fidelity validation failed; output was not retained.");
  return { bytes, mimeType: "model/gltf-binary", warnings: [] };
}

export function optimizedStorageKey(assetId: string, versionId: string): StorageKey {
  return parseStorageKey(`assets/${assetId}/versions/${versionId}/model.glb`);
}

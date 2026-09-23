import { dedup, prune } from "@gltf-transform/functions";
import { NodeIO } from "@gltf-transform/core";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import type { OptimizationOperation } from "../domain/optimization";

export type OptimizationOutput = { bytes: Uint8Array; mimeType: "model/gltf-binary"; warnings: Array<{ code: string; message: string }> };

export async function processOptimization(storage: AssetStorage, inputKey: StorageKey, operation: OptimizationOperation): Promise<OptimizationOutput> {
  if (operation !== "normalize" && operation !== "remove-unused") {
    throw new Error(`Unsupported optimization operation: ${operation}`);
  }
  const io = new NodeIO().setStrictResources(false);
  const document = await io.read(storage.processingPath(inputKey));
  await document.transform(prune(), dedup());
  return { bytes: await io.writeBinary(document), mimeType: "model/gltf-binary", warnings: [] };
}

export function optimizedStorageKey(assetId: string, versionId: string): StorageKey {
  return parseStorageKey(`assets/${assetId}/versions/${versionId}/model.glb`);
}

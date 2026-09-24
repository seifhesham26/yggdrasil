import { createHash } from "node:crypto";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import { AssetImportError } from "../domain/errors";
import type { AssetAnalysis } from "../domain/types";
import type { AssetDetail } from "../infrastructure/asset-repository";
import type { ConvertedModel } from "../infrastructure/model-converter";

export type VariantPromotion = {
  ownerId: string; assetId: string; versionId: string; selectedModelPath: string;
  sourceStorageKey: string; sourceSha256: string; storageKey: StorageKey;
  sha256: string; byteSize: number; mimeType: string; analysis: AssetAnalysis;
};

/** The key records the source path without changing any source or original version row. */
export function variantSourcePath(storageKey: string): string | null {
  const match = /\/variants\/[0-9a-f-]{36}\/(.+)$/.exec(storageKey);
  if (!match) return null;
  return /\.(?:obj|fbx)\.glb$/i.test(match[1]) ? match[1].slice(0, -4) : match[1];
}

export function createSwitchAssetVariant(deps: {
  storage: AssetStorage;
  getAsset: (assetId: string, ownerId: string) => Promise<AssetDetail | null>;
  promote: (input: VariantPromotion) => Promise<void>;
  analyze: (storage: AssetStorage, key: StorageKey) => Promise<AssetAnalysis>;
  convert?: (source: { format: "obj" | "fbx"; relativePath: string; bytes: Uint8Array }) => Promise<ConvertedModel>;
  createId: () => string;
}) {
  return async function switchVariant(input: { ownerId: string; assetId: string; selectedModelPath: string }) {
    const asset = await deps.getAsset(input.assetId, input.ownerId);
    if (!asset || asset.status !== "ready") throw new AssetImportError("INVALID_FILE", "Asset is not available to this owner.");
    const source = asset.files.find((file) => file.relativePath === input.selectedModelPath && ["source", "model"].includes(file.role) && /\.(?:gltf|glb|obj|fbx)$/i.test(file.relativePath));
    if (!source) throw new AssetImportError("INVALID_FILE", "Selected variant is not a retained source model.");
    const sourceKey = parseStorageKey(source.storageKey);
    const sourceBytes = await deps.storage.read(sourceKey);
    if (sourceBytes.byteLength !== source.byteSize || createHash("sha256").update(sourceBytes).digest("hex") !== source.sha256) {
      throw new AssetImportError("IMPORT_FAILED", "Retained source hash does not match its import record.");
    }
    const ext = source.relativePath.split(".").at(-1)!.toLowerCase();
    const converted = ext === "obj" || ext === "fbx";
    if (converted && !deps.convert) throw new AssetImportError("IMPORT_FAILED", "No converter is configured for this variant.");
    const versionId = deps.createId();
    const variantPrefix = parseStorageKey(`assets/${input.assetId}/variants/${versionId}`);
    const storageKey = parseStorageKey(`${variantPrefix}/${source.relativePath}${converted ? ".glb" : ""}`);
    let promotionStarted = false;
    try {
      let analysis: AssetAnalysis;
      let outputBytes: Uint8Array;
      if (converted) {
        const result = await deps.convert!({ format: ext as "obj" | "fbx", relativePath: source.relativePath, bytes: sourceBytes });
        outputBytes = result.bytes;
        await deps.storage.put(storageKey, outputBytes);
        const measured = await deps.analyze(deps.storage, storageKey);
        analysis = { ...measured, warnings: [...measured.warnings, ...result.warnings.map((warning) => ({ ...warning, severity: "warning" as const }))] };
      } else {
        analysis = await deps.analyze(deps.storage, sourceKey);
        await deps.storage.putFile(storageKey, deps.storage.processingPath(sourceKey));
        outputBytes = await deps.storage.read(storageKey);
        if (outputBytes.byteLength !== source.byteSize || createHash("sha256").update(outputBytes).digest("hex") !== source.sha256) {
          throw new AssetImportError("IMPORT_FAILED", "Variant copy differs from retained source.");
        }
      }
      promotionStarted = true;
      await deps.promote({
        ...input, versionId, sourceStorageKey: source.storageKey, sourceSha256: source.sha256,
        storageKey, sha256: createHash("sha256").update(outputBytes).digest("hex"),
        byteSize: outputBytes.byteLength, mimeType: converted || ext === "glb" ? "model/gltf-binary" : "model/gltf+json", analysis,
      });
      return { versionId, storageKey };
    } catch (error) {
      if (promotionStarted) {
        try {
          const current = await deps.getAsset(input.assetId, input.ownerId);
          if (current?.currentVersionId === versionId) return { versionId, storageKey };
        } catch {
          throw new AssetImportError("IMPORT_FAILED", "Variant state is uncertain; derived files were preserved for recovery.");
        }
      }
      await deps.storage.removeTree(variantPrefix);
      throw error;
    }
  };
}

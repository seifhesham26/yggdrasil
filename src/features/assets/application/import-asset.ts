import { createHash } from "node:crypto";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { AssetImportError } from "../domain/errors";
import type { AssetAnalysis, ImportFile } from "../domain/types";
import { analyzeGltf } from "../infrastructure/gltf-analyzer";
import { buildImportManifest } from "../infrastructure/import-manifest";
import type { AssetRepository, StoredAssetFile } from "../infrastructure/asset-repository";

export type ImportAssetRequest = { ownerId: string; name: string; entries: ImportFile[] };
export type ImportAssetResult = { assetId: string; sourceId: string; analysis: AssetAnalysis };

const MIME: Record<string, string> = {
  gltf: "model/gltf+json", glb: "model/gltf-binary", bin: "application/octet-stream",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2",
  txt: "text/plain", md: "text/markdown",
};

function fileRecord(file: ImportFile, prefix: string, role: StoredAssetFile["role"]): StoredAssetFile {
  const ext = file.relativePath.slice(file.relativePath.lastIndexOf(".") + 1).toLowerCase();
  return {
    relativePath: file.relativePath,
    storageKey: parseStorageKey(`${prefix}/${file.relativePath}`),
    byteSize: file.bytes.byteLength,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    mimeType: MIME[ext] ?? "application/octet-stream",
    role,
  };
}

export function createImportAsset(deps: {
  storage: AssetStorage;
  repository: AssetRepository;
  buildManifest: typeof buildImportManifest;
  analyze: typeof analyzeGltf;
  createId: () => string;
}) {
  return async function importAsset(request: ImportAssetRequest): Promise<ImportAssetResult> {
    const manifest = await deps.buildManifest(request.entries);
    const importId = deps.createId();
    const stagedPrefix = parseStorageKey(`staging/${importId}`);
    const files = [manifest.primaryModel, ...manifest.dependencies, ...manifest.attributionFiles];
    const created = await deps.repository.createImport({ ownerId: request.ownerId, name: request.name });
    const finalPrefix = parseStorageKey(`assets/${created.assetId}/source`);
    let committed = false;
    try {
      for (const file of files) {
        await deps.storage.put(parseStorageKey(`${stagedPrefix}/${file.relativePath}`), file.bytes);
      }
      const analysis = await deps.analyze(deps.storage, parseStorageKey(`${stagedPrefix}/${manifest.primaryModel.relativePath}`));
      const records = [
        fileRecord(manifest.primaryModel, finalPrefix, "model"),
        ...manifest.dependencies.map((file) => fileRecord(file, finalPrefix, "dependency")),
        ...manifest.attributionFiles.map((file) => fileRecord(file, finalPrefix, "attribution")),
      ];
      await deps.storage.commitTree(stagedPrefix, finalPrefix);
      committed = true;
      await deps.repository.completeImport({ ownerId: request.ownerId, assetId: created.assetId, sourceId: created.sourceId, files: records, analysis });
      return { ...created, analysis };
    } catch (error) {
      // A dropped response can arrive after a successful DB commit. Never delete
      // its source files if the completed record is visible on a follow-up read.
      if (committed) {
        try {
          const current = await deps.repository.getAsset(created.assetId, request.ownerId);
          if (current?.status === "ready" && current.analysis) return { ...created, analysis: current.analysis };
        } catch {
          throw new AssetImportError("IMPORT_FAILED", "Import state is uncertain; source files were preserved for recovery.");
        }
      }
      const code = error instanceof AssetImportError ? error.code : "IMPORT_FAILED";
      const prefix = committed ? finalPrefix : stagedPrefix;
      try {
        await deps.storage.removeTree(prefix);
        await deps.repository.failImport(created.assetId, request.ownerId, code);
      } catch {
        throw new AssetImportError("IMPORT_FAILED", "Import failed and cleanup needs attention.");
      }
      throw new AssetImportError(code, "Import failed. Please check the model files and retry.");
    }
  };
}

import { createHash } from "node:crypto";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { AssetImportError } from "../domain/errors";
import type { AssetAnalysis, ImportFile, ImportManifest, ImportSource } from "../domain/types";
import { analyzeGltf } from "../infrastructure/gltf-analyzer";
import { readImportBytes } from "../infrastructure/import-manifest";
import { convertModelToGlb } from "../infrastructure/model-converter";
import type { AssetRepository, StoredAssetFile } from "../infrastructure/asset-repository";

export type ImportAssetRequest = { ownerId: string; name: string; entries: ImportSource[]; assetId?: string };
export type ImportAssetResult = { assetId: string; sourceId: string; analysis: AssetAnalysis };

const MIME: Record<string, string> = {
  gltf: "model/gltf+json", glb: "model/gltf-binary", fbx: "application/octet-stream", obj: "text/plain", mtl: "text/plain", bin: "application/octet-stream",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2",
  txt: "text/plain", md: "text/markdown", zip: "application/zip",
};

function fileRecord(file: ImportSource, prefix: string, role: StoredAssetFile["role"]): StoredAssetFile {
  const ext = file.relativePath.slice(file.relativePath.lastIndexOf(".") + 1).toLowerCase();
  return {
    relativePath: file.relativePath,
    storageKey: parseStorageKey(`${prefix}/${file.relativePath}`),
    byteSize: "bytes" in file ? file.bytes.byteLength : file.byteSize,
    sha256: "bytes" in file ? createHash("sha256").update(file.bytes).digest("hex") : file.sha256,
    mimeType: MIME[ext] ?? "application/octet-stream",
    role,
  };
}

export function createImportAsset(deps: {
  storage: AssetStorage;
  repository: AssetRepository;
  buildManifest: (entries: ImportSource[]) => Promise<ImportManifest<ImportSource>>;
  analyze: typeof analyzeGltf;
  convert?: typeof convertModelToGlb;
  createId: () => string;
  reportProgress?: (progress: { phase: "staging" | "analyzing" | "committing"; nextFile: number; processedBytes: number; totalBytes: number }) => Promise<void>;
  isCancelled?: () => Promise<boolean>;
}) {
  return async function importAsset(request: ImportAssetRequest): Promise<ImportAssetResult> {
    const manifest = await deps.buildManifest(request.entries);
    const importId = request.assetId ?? deps.createId();
    const stagedPrefix = parseStorageKey(`staging/${importId}`);
    const sourceFiles = [manifest.primaryModel, ...manifest.dependencies, ...manifest.attributionFiles, ...(manifest.archive ? [manifest.archive] : [])];
    const sourceExtension = manifest.primaryModel.relativePath.slice(manifest.primaryModel.relativePath.lastIndexOf(".") + 1).toLowerCase();
    let analysisFile: ImportSource = manifest.primaryModel;
    let conversionWarnings: Array<{ code: string; message: string }> = [];
    let converted: ImportFile | undefined;
    if (sourceExtension === "obj" || sourceExtension === "fbx") {
      if (!deps.convert) throw new AssetImportError("IMPORT_FAILED", `No converter is configured for ${sourceExtension.toUpperCase()} imports.`);
      const result = await deps.convert({ format: sourceExtension, relativePath: manifest.primaryModel.relativePath, bytes: await readImportBytes(manifest.primaryModel) });
      converted = { relativePath: `__normalized/${manifest.primaryModel.relativePath.replace(/\.[^.]+$/, ".glb")}`, bytes: result.bytes };
      analysisFile = converted;
      conversionWarnings = result.warnings;
    }
    const files = [...sourceFiles, ...(converted ? [converted] : [])];
    const created = await deps.repository.createImport({ ownerId: request.ownerId, name: request.name, assetId: request.assetId });
    const finalPrefix = parseStorageKey(`assets/${created.assetId}/source`);
    if (request.assetId) {
      const existing = await deps.repository.getAsset(created.assetId, request.ownerId);
      if (existing?.status === "ready" && existing.analysis) return { ...created, analysis: existing.analysis };
    }
    const records = [
      fileRecord(manifest.primaryModel, finalPrefix, converted ? "source" : "model"),
      ...manifest.dependencies.map((file) => fileRecord(file, finalPrefix, "dependency")),
      ...manifest.attributionFiles.map((file) => fileRecord(file, finalPrefix, "attribution")),
      ...(manifest.archive ? [fileRecord(manifest.archive, finalPrefix, "source")] : []),
      ...(converted ? [fileRecord(converted, finalPrefix, "model")] : []),
    ];
    const finalModelKey = parseStorageKey(`${finalPrefix}/${analysisFile.relativePath}`);
    let committed = false;
    let recoveredFinal = false;
    try {
      if (request.assetId && await deps.storage.exists(finalModelKey)) {
        recoveredFinal = true;
        for (const record of records) {
          const stored = await deps.storage.read(parseStorageKey(record.storageKey));
          const hash = createHash("sha256").update(stored).digest("hex");
          if (record.role === "model" && converted) {
            record.sha256 = hash;
            record.byteSize = stored.byteLength;
          } else if (stored.byteLength !== record.byteSize || hash !== record.sha256) {
            throw new AssetImportError("IMPORT_FAILED", `Retained source does not match uploaded bytes: ${record.relativePath}`);
          }
        }
        const reopened = await deps.analyze(deps.storage, finalModelKey);
        const analysis = conversionWarnings.length
          ? { ...reopened, warnings: [...reopened.warnings, ...conversionWarnings.map((warning) => ({ ...warning, severity: "warning" as const }))] }
          : reopened;
        await deps.repository.completeImport({ ownerId: request.ownerId, assetId: created.assetId, sourceId: created.sourceId, files: records, analysis });
        await deps.storage.removeTree(stagedPrefix);
        return { ...created, analysis };
      }
      if (request.assetId) await deps.storage.removeTree(stagedPrefix);
      const totalBytes = files.reduce((sum, file) => sum + ("bytes" in file ? file.bytes.byteLength : file.byteSize), 0);
      let processedBytes = 0;
      for (const [index, file] of files.entries()) {
        if (await deps.isCancelled?.()) throw new AssetImportError("IMPORT_CANCELLED", "Import was cancelled");
        const key = parseStorageKey(`${stagedPrefix}/${file.relativePath}`);
        if ("bytes" in file) await deps.storage.put(key, file.bytes);
        else await deps.storage.putFile(key, file.path);
        processedBytes += "bytes" in file ? file.bytes.byteLength : file.byteSize;
        await deps.reportProgress?.({ phase: "staging", nextFile: index + 1, processedBytes, totalBytes });
      }
      if (await deps.isCancelled?.()) throw new AssetImportError("IMPORT_CANCELLED", "Import was cancelled");
      await deps.reportProgress?.({ phase: "analyzing", nextFile: files.length, processedBytes, totalBytes });
      const analysisResult = await deps.analyze(deps.storage, parseStorageKey(`${stagedPrefix}/${analysisFile.relativePath}`));
      const analysis = conversionWarnings.length
        ? { ...analysisResult, warnings: [...analysisResult.warnings, ...conversionWarnings.map((warning) => ({ ...warning, severity: "warning" as const }))] }
        : analysisResult;
      if (await deps.isCancelled?.()) throw new AssetImportError("IMPORT_CANCELLED", "Import was cancelled");
      await deps.reportProgress?.({ phase: "committing", nextFile: files.length, processedBytes, totalBytes });
      await deps.storage.commitTree(stagedPrefix, finalPrefix);
      committed = true;
      await deps.repository.completeImport({ ownerId: request.ownerId, assetId: created.assetId, sourceId: created.sourceId, files: records, analysis });
      return { ...created, analysis };
    } catch (error) {
      if (recoveredFinal) throw new AssetImportError("IMPORT_FAILED", "Retained source was preserved; import recovery needs attention.");
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

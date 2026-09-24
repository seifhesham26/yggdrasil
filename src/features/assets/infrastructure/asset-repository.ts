import { and, desc, eq, or, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { assetFiles, assetSources, assets, assetVersions, sceneAnalyses } from "@/db/schema/assets";
import type { AssetAnalysis } from "../domain/types";
import { DrizzleOptimizationPersistence } from "./optimization-persistence";

export type StoredAssetFile = {
  relativePath: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  mimeType: string;
  role: "model" | "source" | "dependency" | "attribution";
};

export type CreateImportRecord = { ownerId: string; name: string };
export type CompleteImportRecord = {
  ownerId: string;
  assetId: string;
  sourceId: string;
  files: StoredAssetFile[];
  analysis: AssetAnalysis;
};
export type AssetSummary = {
  id: string;
  name: string;
  status: "importing" | "ready" | "failed";
  createdAt: Date;
  updatedAt: Date;
  byteSize: number | null;
  format: "GLB" | "glTF" | null;
  counts: Pick<AssetAnalysis["counts"], "meshes" | "triangles" | "animations"> | null;
};
export type AssetDetail = AssetSummary & {
  ownerId: string;
  currentVersionId?: string | null;
  errorCode: string | null;
  files: StoredAssetFile[];
  analysis: AssetAnalysis | null;
  selectedFile?: StoredAssetFile | null;
  retainedFiles?: StoredAssetFile[];
  sourceByteSize?: number | null;
};

export interface AssetRepository {
  createImport(input: CreateImportRecord): Promise<{ assetId: string; sourceId: string }>;
  completeImport(input: CompleteImportRecord): Promise<void>;
  failImport(assetId: string, ownerId: string, errorCode: string): Promise<void>;
  getAsset(assetId: string, ownerId: string): Promise<AssetDetail | null>;
  listAssets(ownerId: string): Promise<AssetSummary[]>;
}

export class DrizzleAssetRepository implements AssetRepository {
  async createImport(input: CreateImportRecord): Promise<{ assetId: string; sourceId: string }> {
    return db.transaction(async (tx) => {
      const [asset] = await tx.insert(assets).values({ ownerId: input.ownerId, name: input.name }).returning({ id: assets.id });
      const [source] = await tx.insert(assetSources).values({ assetId: asset.id, storageKey: `assets/${asset.id}/source` }).returning({ id: assetSources.id });
      return { assetId: asset.id, sourceId: source.id };
    });
  }

  async completeImport(input: CompleteImportRecord): Promise<void> {
    const primary = input.files.find((file) => file.role === "model");
    if (!primary) throw new Error("Import has no primary model file");
    await db.transaction(async (tx) => {
      const [asset] = await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.id, input.assetId), eq(assets.ownerId, input.ownerId), eq(assets.status, "importing"))).limit(1);
      if (!asset) throw new Error("Import is not pending");
      const [source] = await tx.select({ id: assetSources.id }).from(assetSources).where(and(eq(assetSources.id, input.sourceId), eq(assetSources.assetId, input.assetId))).limit(1);
      if (!source) throw new Error("Source does not belong to this import");
      await tx.insert(assetFiles).values(input.files.map((file) => ({ ...file, sourceId: input.sourceId })));
      await tx.update(assetSources).set({ byteSize: input.files.reduce((sum, file) => sum + file.byteSize, 0) }).where(and(eq(assetSources.id, input.sourceId), eq(assetSources.assetId, input.assetId)));
      const [version] = await tx.insert(assetVersions).values({
        assetId: input.assetId, sourceId: input.sourceId, kind: "original", storageKey: primary.storageKey,
        byteSize: primary.byteSize, sha256: primary.sha256, mimeType: primary.mimeType,
      }).returning({ id: assetVersions.id });
      await tx.insert(sceneAnalyses).values({ assetId: input.assetId, versionId: version.id, snapshot: input.analysis });
      await tx.update(assets).set({ status: "ready", errorCode: null, currentVersionId: version.id, updatedAt: new Date() }).where(and(eq(assets.id, input.assetId), eq(assets.ownerId, input.ownerId)));
    });
  }

  async failImport(assetId: string, ownerId: string, errorCode: string): Promise<void> {
    await db.update(assets).set({ status: "failed", errorCode, updatedAt: new Date() }).where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId), eq(assets.status, "importing")));
  }

  async getAsset(assetId: string, ownerId: string): Promise<AssetDetail | null> {
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId))).limit(1);
    if (!asset) return null;
    const [source] = await db.select({ id: assetSources.id, byteSize: assetSources.byteSize }).from(assetSources).where(eq(assetSources.assetId, assetId)).limit(1);
    const files = source ? await db.select({
      relativePath: assetFiles.relativePath, storageKey: assetFiles.storageKey, byteSize: assetFiles.byteSize,
      sha256: assetFiles.sha256, mimeType: assetFiles.mimeType, role: assetFiles.role,
    }).from(assetFiles).where(eq(assetFiles.sourceId, source.id)) : [];
    const history = asset.status === "ready" ? await new DrizzleOptimizationPersistence().load(ownerId, assetId) : undefined;
    const selected = history?.versions.find((version) => version.id === history.currentVersionId);
    // Version rows are the manifest for generated single-file GLBs. Source package
    // files remain separate so all original dependencies and attribution survive.
    const retainedFiles: StoredAssetFile[] = history?.versions.map((version) => files.find((file) => file.storageKey === version.storageKey) ?? {
      relativePath: "model.glb", storageKey: version.storageKey, byteSize: version.byteSize, sha256: version.sha256, mimeType: "model/gltf-binary", role: "model" as const,
    }) ?? [];
    const primary = retainedFiles.find((file) => file.storageKey === selected?.storageKey);
    const analysis = selected?.analysis ?? null;
    return {
      id: asset.id, ownerId: asset.ownerId, currentVersionId: history?.currentVersionId ?? asset.currentVersionId, name: asset.name, status: asset.status, errorCode: asset.errorCode,
      createdAt: asset.createdAt, updatedAt: asset.updatedAt, byteSize: selected?.byteSize ?? null, sourceByteSize: source?.byteSize ?? null,
      format: primary?.mimeType === "model/gltf-binary" ? "GLB" : primary ? "glTF" : null,
      counts: analysis ? { meshes: analysis.counts.meshes, triangles: analysis.counts.triangles, animations: analysis.counts.animations } : null,
      files, analysis, selectedFile: primary ?? null, retainedFiles,
    };
  }

  async listAssets(ownerId: string): Promise<AssetSummary[]> {
    const rows = await db.select({
      id: assets.id, name: assets.name, status: assets.status, createdAt: assets.createdAt, updatedAt: assets.updatedAt,
      byteSize: assetVersions.byteSize, mimeType: assetVersions.mimeType, analysis: sceneAnalyses.snapshot,
    }).from(assets)
      .leftJoin(assetSources, eq(assetSources.assetId, assets.id))
      .leftJoin(assetFiles, and(eq(assetFiles.sourceId, assetSources.id), eq(assetFiles.role, "model")))
      .leftJoin(assetVersions, and(eq(assetVersions.assetId, assets.id), or(eq(assetVersions.id, assets.currentVersionId), and(isNull(assets.currentVersionId), eq(assetVersions.kind, "original")))))
      .leftJoin(sceneAnalyses, eq(sceneAnalyses.versionId, assetVersions.id))
      .where(eq(assets.ownerId, ownerId))
      .orderBy(desc(assets.createdAt));
    return rows.map((row) => ({
      id: row.id, name: row.name, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt,
      byteSize: row.byteSize, format: row.mimeType === "model/gltf-binary" ? "GLB" as const : row.mimeType ? "glTF" as const : null,
      counts: row.analysis ? { meshes: row.analysis.counts.meshes, triangles: row.analysis.counts.triangles, animations: row.analysis.counts.animations } : null,
    }));
  }
}

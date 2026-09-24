import { and, asc, eq, or, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { assetVersions, assets, optimizationOperations, sceneAnalyses } from "@/db/schema/assets";
import { parseStorageKey } from "@/lib/storage/storage-key";
import type { OptimizationAttempt, OptimizationPersistence, OptimizationPersistenceSnapshot, OptimizationVersion } from "../application/reversible-optimization";
import type { OptimizationOperation } from "../domain/optimization";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ownedAsset(tx: Transaction, ownerId: string, assetId: string) {
  const [asset] = await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId), eq(assets.status, "ready"))).for("update");
  if (!asset) throw new Error("Asset is not available to this owner.");
  return asset;
}

async function retainedVersion(tx: Transaction, assetId: string, versionId: string) {
  const [row] = await tx.select({ version: assetVersions }).from(assetVersions)
    .innerJoin(sceneAnalyses, eq(sceneAnalyses.versionId, assetVersions.id))
    .leftJoin(optimizationOperations, and(eq(optimizationOperations.id, assetVersions.operationId), eq(optimizationOperations.assetId, assetId), eq(optimizationOperations.status, "succeeded")))
    .where(and(eq(assetVersions.id, versionId), eq(assetVersions.assetId, assetId), or(eq(assetVersions.kind, "original"), eq(assetVersions.kind, "converted"), isNotNull(optimizationOperations.id))));
  if (!row) throw new Error("Asset version is not available to this owner.");
  return row.version;
}

function attemptRecord(attempt: OptimizationAttempt) {
  return {
    id: attempt.id, assetId: attempt.assetId, parentVersionId: attempt.parentVersionId,
    operation: attempt.operation, parameters: { settings: attempt.settings, outputVersionId: attempt.versionId, retryOf: attempt.retryOf },
    status: attempt.status, errorMessage: attempt.error ?? null, createdAt: attempt.createdAt, completedAt: new Date(),
  };
}

/** Each mutation locks the owned asset and validates retained lineage in one transaction. */
export class DrizzleOptimizationPersistence implements OptimizationPersistence {
  async promote(version: OptimizationVersion, attempt: OptimizationAttempt): Promise<void> {
    await db.transaction(async (tx) => {
      await ownedAsset(tx, version.ownerId, version.assetId);
      const parent = await retainedVersion(tx, version.assetId, version.parentVersionId);
      if (attempt.ownerId !== version.ownerId || attempt.assetId !== version.assetId || attempt.versionId !== version.id || attempt.parentVersionId !== parent.id || attempt.operation !== version.operation || attempt.status !== "succeeded") throw new Error("Invalid promotion lineage.");
      await tx.insert(assetVersions).values({
        id: version.id, assetId: version.assetId, sourceId: parent.sourceId, kind: "optimized",
        storageKey: version.storageKey, byteSize: version.byteSize, sha256: version.sha256,
        mimeType: "model/gltf-binary", parentVersionId: parent.id, createdAt: version.createdAt,
      });
      await tx.insert(sceneAnalyses).values({ assetId: version.assetId, versionId: version.id, snapshot: version.analysis });
      await tx.insert(optimizationOperations).values(attemptRecord(attempt));
      await tx.update(assetVersions).set({ operationId: attempt.id }).where(eq(assetVersions.id, version.id));
      await tx.update(assets).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(assets.id, version.assetId));
    });
  }

  async saveVersion(version: OptimizationVersion): Promise<void> {
    // Originals belong to the import transaction. Never manufacture a second one.
    await db.transaction(async (tx) => {
      await ownedAsset(tx, version.ownerId, version.assetId);
      const existing = await retainedVersion(tx, version.assetId, version.id);
      if (existing.kind !== "original" || existing.storageKey !== version.storageKey || existing.sha256 !== version.sha256) throw new Error("Original version does not match the retained import.");
    });
  }

  async saveAttempt(attempt: OptimizationAttempt): Promise<void> {
    if (attempt.status !== "failed") throw new Error("Successful attempts must be promoted atomically.");
    await db.transaction(async (tx) => {
      await ownedAsset(tx, attempt.ownerId, attempt.assetId);
      await retainedVersion(tx, attempt.assetId, attempt.parentVersionId);
      await tx.insert(optimizationOperations).values(attemptRecord(attempt));
    });
  }

  async setCurrent(ownerId: string, assetId: string, versionId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await ownedAsset(tx, ownerId, assetId);
      await retainedVersion(tx, assetId, versionId);
      await tx.update(assets).set({ currentVersionId: versionId, updatedAt: new Date() }).where(eq(assets.id, assetId));
    });
  }

  async load(ownerId: string, assetId: string): Promise<OptimizationPersistenceSnapshot> {
    return db.transaction(async (tx) => {
      const [asset] = await tx.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId))).for("update");
      if (!asset) return { versions: [], attempts: [] };
      const rows = await tx.select({ version: assetVersions, analysis: sceneAnalyses.snapshot, operation: optimizationOperations.operation }).from(assetVersions)
        .innerJoin(sceneAnalyses, eq(sceneAnalyses.versionId, assetVersions.id))
        .leftJoin(optimizationOperations, and(eq(optimizationOperations.id, assetVersions.operationId), eq(optimizationOperations.assetId, assetId), eq(optimizationOperations.status, "succeeded")))
        .where(eq(assetVersions.assetId, assetId)).orderBy(asc(assetVersions.createdAt));
      const versions: OptimizationVersion[] = rows.filter(({ version, operation }) => version.kind === "original" || version.kind === "converted" || operation !== null).map(({ version, analysis, operation }) => ({
        id: version.id, assetId, ownerId, parentVersionId: version.parentVersionId ?? version.id,
        storageKey: parseStorageKey(version.storageKey), sha256: version.sha256, byteSize: version.byteSize, analysis,
        operation: version.kind === "original" ? "original" : version.kind === "converted" ? "variant" : operation as OptimizationOperation, createdAt: version.createdAt,
      }));
      let currentVersionId = asset.currentVersionId ?? undefined;
      if (!currentVersionId) {
        currentVersionId = versions.find((version) => version.operation === "original")?.id;
        if (currentVersionId) await tx.update(assets).set({ currentVersionId }).where(eq(assets.id, assetId));
      }
      if (currentVersionId && !versions.some((version) => version.id === currentVersionId)) throw new Error("Current version is not retained.");
      const attempts = await tx.select({ operation: optimizationOperations, outputId: assetVersions.id }).from(optimizationOperations)
        .leftJoin(assetVersions, and(eq(assetVersions.operationId, optimizationOperations.id), eq(assetVersions.assetId, assetId)))
        .where(eq(optimizationOperations.assetId, assetId)).orderBy(asc(optimizationOperations.createdAt));
      return {
        currentVersionId, versions,
        attempts: attempts.filter(({ operation }) => operation.status === "succeeded" || operation.status === "failed").map(({ operation, outputId }) => {
          const parameters = operation.parameters as { settings?: { keepExtras: boolean }; outputVersionId?: string; retryOf?: string };
          return { id: operation.id, ownerId, assetId, versionId: outputId ?? parameters.outputVersionId ?? "", parentVersionId: operation.parentVersionId,
            operation: operation.operation as OptimizationOperation, settings: parameters.settings ?? { keepExtras: true }, retryOf: parameters.retryOf,
            status: operation.status as "succeeded" | "failed", error: operation.errorMessage ?? undefined, createdAt: operation.createdAt };
        }),
      };
    });
  }
}

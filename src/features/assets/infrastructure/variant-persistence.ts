import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assetFiles, assetSources, assets, assetVersions, sceneAnalyses } from "@/db/schema/assets";
import type { VariantPromotion } from "../application/variant-switch";

export class DrizzleVariantPersistence {
  async promote(input: VariantPromotion): Promise<void> {
    await db.transaction(async (tx) => {
      const [asset] = await tx.select().from(assets).where(and(eq(assets.id, input.assetId), eq(assets.ownerId, input.ownerId), eq(assets.status, "ready"))).for("update");
      if (!asset) throw new Error("Asset is not available to this owner.");
      const [source] = await tx.select({ id: assetSources.id }).from(assetFiles)
        .innerJoin(assetSources, eq(assetSources.id, assetFiles.sourceId))
        .where(and(eq(assetSources.assetId, input.assetId), eq(assetFiles.relativePath, input.selectedModelPath), eq(assetFiles.storageKey, input.sourceStorageKey), eq(assetFiles.sha256, input.sourceSha256)));
      if (!source) throw new Error("Selected source model is not retained on this asset.");
      await tx.insert(assetVersions).values({
        id: input.versionId, assetId: input.assetId, sourceId: source.id, kind: "converted",
        storageKey: input.storageKey, sha256: input.sha256, byteSize: input.byteSize,
        mimeType: input.mimeType, parentVersionId: asset.currentVersionId,
      });
      await tx.insert(sceneAnalyses).values({ assetId: input.assetId, versionId: input.versionId, snapshot: input.analysis });
      await tx.update(assets).set({ currentVersionId: input.versionId, updatedAt: new Date() }).where(eq(assets.id, input.assetId));
    });
  }
}

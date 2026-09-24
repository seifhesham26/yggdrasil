import { randomUUID } from "node:crypto";
import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { createSwitchAssetVariant } from "@/features/assets/application/variant-switch";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { DrizzleVariantPersistence } from "@/features/assets/infrastructure/variant-persistence";
import { analyzeGltf } from "@/features/assets/infrastructure/gltf-analyzer";
import { convertModelToGlb } from "@/features/assets/infrastructure/model-converter";
import { createVariantSwitchHandler } from "./handler";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  const repository = new DrizzleAssetRepository();
  const storage = new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT);
  const switchVariant = createSwitchAssetVariant({
    storage, getAsset: (id, owner) => repository.getAsset(id, owner),
    promote: (input) => new DrizzleVariantPersistence().promote(input),
    analyze: analyzeGltf, convert: convertModelToGlb, createId: randomUUID,
  });
  return createVariantSwitchHandler({
    getSession: (headers) => auth.api.getSession({ headers }),
    getAsset: (id, owner) => repository.getAsset(id, owner), switchVariant,
  })(request, assetId);
}

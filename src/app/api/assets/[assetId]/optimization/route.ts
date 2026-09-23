import { createGetAsset } from "@/features/assets/application/get-asset";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { getOwnerSession } from "@/auth/server-session";
import { createOptimizationHandler } from "./handler";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  return createOptimizationHandler({
    getSession: getOwnerSession,
    getAsset: createGetAsset(new DrizzleAssetRepository()),
  })(assetId);
}

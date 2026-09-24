import { createGetAsset } from "@/features/assets/application/get-asset";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { getOwnerSession } from "@/auth/server-session";
import { createOptimizationHandler } from "./handler";
import { createOptimizationMutationHandler } from "./handler";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { serverEnv } from "@/lib/env/server";
import { DrizzleOptimizationPersistence } from "@/features/assets/infrastructure/optimization-persistence";
import { ReversibleOptimizationHistory } from "@/features/assets/application/reversible-optimization";
import { analyzeGltf } from "@/features/assets/infrastructure/gltf-analyzer";

async function historyFor(assetId: string, ownerId: string): Promise<ReversibleOptimizationHistory | null> {
  const repository = new DrizzleAssetRepository();
  const asset = await createGetAsset(repository)(assetId, ownerId);
  const primary = asset?.files.find((file) => file.role === "model");
  if (!asset || asset.status !== "ready" || !primary || !asset.analysis) return null;
  const history = new ReversibleOptimizationHistory(new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT), analyzeGltf, undefined, new DrizzleOptimizationPersistence());
  await history.reload(ownerId, assetId);
  if (!history.currentVersion(ownerId, assetId)) return null;
  return history;
}

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  if (new URL(request.url).searchParams.get("view") === "history") {
    return createOptimizationMutationHandler({ getSession: getOwnerSession, getHistory: historyFor })(assetId, request);
  }
  return createOptimizationHandler({
    getSession: getOwnerSession,
    getAsset: createGetAsset(new DrizzleAssetRepository()),
  })(assetId);
}

export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  return createOptimizationMutationHandler({ getSession: getOwnerSession, getHistory: historyFor })(assetId, request);
}

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  return createOptimizationMutationHandler({ getSession: getOwnerSession, getHistory: historyFor })(assetId, request);
}

import type { AssetDetail, AssetRepository } from "../infrastructure/asset-repository";

export function createGetAsset(repository: AssetRepository) {
  return async function getAsset(assetId: string, ownerId: string): Promise<AssetDetail | null> {
    return repository.getAsset(assetId, ownerId);
  };
}

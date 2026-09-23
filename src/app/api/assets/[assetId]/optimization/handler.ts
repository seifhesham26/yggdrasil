import { buildOptimizationReport } from "@/features/assets/domain/optimization";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";

export function createOptimizationHandler(deps: {
  getSession: () => Promise<{ user: { id: string } } | null>;
  getAsset: (assetId: string, ownerId: string) => Promise<AssetDetail | null>;
}) {
  return async function getOptimizationReport(assetId: string): Promise<Response> {
    const session = await deps.getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const asset = await deps.getAsset(assetId, session.user.id);
    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (!asset.analysis) return Response.json({ state: "no-recommendations", findings: [] });
    return Response.json(buildOptimizationReport(asset.analysis, asset.byteSize ?? 0));
  };
}

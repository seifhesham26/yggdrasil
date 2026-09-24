import { buildOptimizationReport } from "@/features/assets/domain/optimization";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";
import type { OptimizationOperation } from "@/features/assets/domain/optimization";
import type { OptimizationSettings, OptimizationVersion } from "@/features/assets/application/reversible-optimization";

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

type HistoryLike = {
  apply: (input: { ownerId: string; assetId: string; operation: OptimizationOperation; approve: boolean; settings?: OptimizationSettings }) => Promise<unknown>;
  retry: (ownerId: string, assetId: string) => Promise<unknown>;
  revert: (ownerId: string, assetId: string, versionId: string) => void | Promise<void>;
  currentVersion: (ownerId: string, assetId: string) => OptimizationVersion | undefined;
  list: (ownerId: string, assetId: string) => unknown[];
  attemptsFor: (ownerId: string, assetId: string) => unknown[];
};

export function createOptimizationMutationHandler(deps: {
  getSession: () => Promise<{ user: { id: string } } | null>;
  getHistory: (assetId: string, ownerId: string) => Promise<HistoryLike | null>;
}) {
  return async function mutateOptimization(assetId: string, request: Request): Promise<Response> {
    const session = await deps.getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const history = await deps.getHistory(assetId, session.user.id);
      if (!history) return Response.json({ error: "Not found" }, { status: 404 });
      const current = history.currentVersion(session.user.id, assetId);
      if (request.method === "GET") return Response.json({ currentVersionId: current?.id, versions: history.list(session.user.id, assetId), attempts: history.attemptsFor(session.user.id, assetId), report: current ? buildOptimizationReport(current.analysis, current.byteSize) : { state: "no-recommendations", findings: [] } });
      let body: { action?: string; operation?: OptimizationOperation; approve?: boolean; versionId?: string; settings?: OptimizationSettings };
      try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request" }, { status: 400 });
      if (request.method === "PATCH" && body.action === "revert" && body.versionId) {
        await history.revert(session.user.id, assetId, body.versionId);
        return Response.json({ currentVersionId: body.versionId });
      }
      if (request.method === "POST" && body.action === "retry") {
        return Response.json(await history.retry(session.user.id, assetId));
      }
      if (request.method === "POST" && body.operation) {
        if (body.settings && (typeof body.settings.keepExtras !== "boolean" || Object.keys(body.settings).some((key) => key !== "keepExtras"))) return Response.json({ error: "Unsupported optimization settings" }, { status: 400 });
        return Response.json(await history.apply({ ownerId: session.user.id, assetId, operation: body.operation, approve: body.approve === true, ...(body.settings ? { settings: body.settings } : {}) }));
      }
      return Response.json({ error: "Unsupported optimization request" }, { status: 400 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Optimization failed", retryable: true }, { status: 422 });
    }
  };
}

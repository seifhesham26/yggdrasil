import { AssetImportError } from "@/features/assets/domain/errors";

export function createVariantSwitchHandler(deps: {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  getAsset: (assetId: string, ownerId: string) => Promise<{ status: string } | null>;
  switchVariant: (input: { ownerId: string; assetId: string; selectedModelPath: string }) => Promise<{ versionId: string; storageKey: string }>;
}) {
  return async function PATCH(request: Request, assetId: string): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const asset = await deps.getAsset(assetId, session.user.id);
    if (!asset) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    if (asset.status !== "ready") return Response.json({ code: "INVALID_ASSET_STATE" }, { status: 409 });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || !("selectedModelPath" in body) || typeof body.selectedModelPath !== "string" || !body.selectedModelPath) {
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    }
    try { return Response.json(await deps.switchVariant({ ownerId: session.user.id, assetId, selectedModelPath: body.selectedModelPath })); }
    catch (error) {
      if (error instanceof AssetImportError) return Response.json({ code: error.code, message: error.message }, { status: 409 });
      return Response.json({ code: "IMPORT_FAILED" }, { status: 500 });
    }
  };
}

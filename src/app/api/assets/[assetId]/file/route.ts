import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { createGetAsset } from "@/features/assets/application/get-asset";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { createFileHandler } from "./handler";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const handler = createFileHandler({
    getSession: (headers) => auth.api.getSession({ headers }),
    getAsset: createGetAsset(new DrizzleAssetRepository()),
    // This object is constructed only after the session check by the handler.
    get storage() { return new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT); },
  });
  return handler(request, context);
}

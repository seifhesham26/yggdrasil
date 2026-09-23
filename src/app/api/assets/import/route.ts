import { randomUUID } from "node:crypto";
import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { createImportAsset } from "@/features/assets/application/import-asset";
import { analyzeGltf } from "@/features/assets/infrastructure/gltf-analyzer";
import { buildImportManifest } from "@/features/assets/infrastructure/import-manifest";
import { convertModelToGlb } from "@/features/assets/infrastructure/model-converter";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { createImportHandler } from "./handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const handler = createImportHandler({
    getSession: (headers) => auth.api.getSession({ headers }),
    importAsset: (input) => createImportAsset({
      storage: new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT),
      repository: new DrizzleAssetRepository(),
      buildManifest: buildImportManifest,
      analyze: analyzeGltf,
      convert: convertModelToGlb,
      createId: randomUUID,
    })(input),
  });
  return handler(request);
}

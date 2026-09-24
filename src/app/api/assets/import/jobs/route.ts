import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { DrizzleImportJobRepository } from "@/features/assets/infrastructure/import-job-persistence";
import { spoolImportUpload } from "@/features/assets/infrastructure/upload-spool";
import { createImportJobUploadHandler } from "./handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return createImportJobUploadHandler({
    getSession: (headers) => auth.api.getSession({ headers }),
    spoolUpload: (input) => {
      new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT);
      return spoolImportUpload(input, serverEnv.YGGDRASIL_ASSET_ROOT);
    },
    createJob: (input) => new DrizzleImportJobRepository().create(input),
    storageRoot: serverEnv.YGGDRASIL_ASSET_ROOT,
  })(request);
}

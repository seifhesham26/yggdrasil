import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { DrizzleImportJobRepository } from "@/features/assets/infrastructure/import-job-persistence";
import { createImportJobHandler } from "./handler";
import { reviewImportSources } from "@/features/assets/application/variant-review";
import { parseStorageKey } from "@/lib/storage/storage-key";

export const runtime = "nodejs";

const handler = createImportJobHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  jobs: new DrizzleImportJobRepository(),
  removeUpload: (prefix) => new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT).removeTree(prefix),
  reviewJob: (job) => {
    const storage = new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT);
    const prefix = parseStorageKey(job.uploadPrefix);
    if (!prefix.startsWith("staging/upload-")) throw new Error("Invalid upload prefix");
    return reviewImportSources(job.files.map((file) => {
      const key = parseStorageKey(file.storageKey);
      if (!key.startsWith(`${prefix}/`)) throw new Error("Upload file escapes job prefix");
      return { relativePath: file.relativePath, path: storage.processingPath(key), byteSize: file.byteSize, sha256: file.sha256 };
    }), job.selectedModelPath ?? undefined);
  },
});

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return handler.GET(request, (await ctx.params).jobId);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return handler.PATCH(request, (await ctx.params).jobId);
}

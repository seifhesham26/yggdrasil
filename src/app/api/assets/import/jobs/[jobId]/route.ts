import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { DrizzleImportJobRepository } from "@/features/assets/infrastructure/import-job-persistence";
import { createImportJobHandler } from "./handler";

export const runtime = "nodejs";

const handler = createImportJobHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  jobs: new DrizzleImportJobRepository(),
  removeUpload: (prefix) => new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT).removeTree(prefix),
});

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return handler.GET(request, (await ctx.params).jobId);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return handler.PATCH(request, (await ctx.params).jobId);
}

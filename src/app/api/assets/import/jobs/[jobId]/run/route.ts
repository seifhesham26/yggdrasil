import { randomUUID } from "node:crypto";
import { auth } from "@/auth/auth";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { createImportAsset } from "@/features/assets/application/import-asset";
import { createProcessImportJob } from "@/features/assets/application/process-import-job";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { analyzeGltf } from "@/features/assets/infrastructure/gltf-analyzer";
import { buildImportManifest } from "@/features/assets/infrastructure/import-manifest";
import { DrizzleImportJobRepository } from "@/features/assets/infrastructure/import-job-persistence";
import { convertModelToGlb } from "@/features/assets/infrastructure/model-converter";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const { jobId } = await ctx.params;
  const jobs = new DrizzleImportJobRepository();
  const job = await jobs.get(session.user.id, jobId);
  if (!job) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (job.phase === "completed") return Response.json({ phase: "completed", assetId: job.assetId });
  const storage = new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT);
  const process = createProcessImportJob({
    storage, jobs,
    importAsset: (input, hooks) => createImportAsset({
      storage, repository: new DrizzleAssetRepository(), buildManifest: buildImportManifest,
      analyze: analyzeGltf, convert: convertModelToGlb, createId: randomUUID,
      reportProgress: hooks.reportProgress, isCancelled: hooks.isCancelled,
    })(input),
  });
  const result = await process(session.user.id, jobId);
  if (!result) return Response.json({ code: "JOB_BUSY" }, { status: 409 });
  return Response.json(result);
}

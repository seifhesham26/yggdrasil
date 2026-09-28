import { and, eq } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { assets, sceneAnalyses } from "@/db/schema/assets";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { serverEnv } from "@/lib/env/server";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { createAnimationImportHandler } from "./handler";

export const runtime = "nodejs";

const handler = createAnimationImportHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  history: new ProjectHistory(new DrizzleProjectRepository()),
  getTargetAnalysis: async (ownerId, assetId, versionId) => {
    const [row] = await db.select({ analysis: sceneAnalyses.snapshot }).from(sceneAnalyses)
      .innerJoin(assets, and(eq(assets.id, sceneAnalyses.assetId), eq(assets.ownerId, ownerId)))
      .where(and(eq(sceneAnalyses.assetId, assetId), eq(sceneAnalyses.versionId, versionId))).limit(1);
    return row?.analysis ?? null;
  },
  storage: new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT),
});

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  return handler((await context.params).projectId, request);
}

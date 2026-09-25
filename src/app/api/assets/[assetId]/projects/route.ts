import { auth } from "@/auth/auth";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { createProjectHandler } from "./handler";

export const runtime = "nodejs";

const handler = createProjectHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  history: new ProjectHistory(new DrizzleProjectRepository()),
});

export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  const { assetId } = await context.params;
  return handler.POST(assetId, request);
}

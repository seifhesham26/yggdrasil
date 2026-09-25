import { auth } from "@/auth/auth";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { createProjectHandler } from "../handler";

export const runtime = "nodejs";

const handler = createProjectHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  history: new ProjectHistory(new DrizzleProjectRepository()),
});

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await context.params;
  return handler.GET(projectId, request);
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await context.params;
  return handler.PATCH(projectId, request);
}

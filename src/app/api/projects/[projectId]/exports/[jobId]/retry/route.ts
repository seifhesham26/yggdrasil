import { exportHandler } from "@/features/exports/infrastructure/export-handler";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ projectId: string; jobId: string }> }): Promise<Response> {
  const { projectId, jobId } = await context.params; return exportHandler().RETRY(request, projectId, jobId);
}

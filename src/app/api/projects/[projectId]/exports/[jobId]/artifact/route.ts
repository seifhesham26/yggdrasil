import { exportHandler } from "@/features/exports/infrastructure/export-handler";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; jobId: string }> }) {
  const { projectId, jobId } = await params;
  return exportHandler().ARTIFACT(request, projectId, jobId);
}

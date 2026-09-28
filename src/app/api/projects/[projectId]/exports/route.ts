import { exportHandler } from "@/features/exports/infrastructure/export-handler";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await context.params; return exportHandler().GET(request, projectId);
}
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await context.params; return exportHandler().POST(request, projectId);
}

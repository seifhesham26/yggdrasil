import type { ProjectHistory } from "@/features/projects/application/project-history";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createProjectHandler(deps: {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  history: Pick<ProjectHistory, "create" | "listForAsset">;
}) {
  return {
    async GET(assetId: string, request: Request): Promise<Response> {
      const session = await deps.getSession(request.headers);
      if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      try {
        const projects = await deps.history.listForAsset(session.user.id, assetId);
        return Response.json({ projects: projects.map(({ id, name, assetVersionId, activeStep, updatedAt }) => ({ id, name, assetVersionId, activeStep, updatedAt })) });
      } catch {
        return Response.json({ code: "PROJECT_STORAGE_UNAVAILABLE", message: "Projects could not be loaded. Retry." }, { status: 503 });
      }
    },
    async POST(assetId: string, request: Request): Promise<Response> {
      const session = await deps.getSession(request.headers);
      if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      let body: unknown = {};
      if (request.headers.get("content-type")?.includes("application/json")) {
        try { body = await request.json(); } catch { return Response.json({ code: "INVALID_JSON" }, { status: 400 }); }
      }
      if (!isRecord(body) ||
        Object.keys(body).some((key) => key !== "name") ||
        ("name" in body && (typeof body.name !== "string" || body.name.length > 200))) {
        return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
      }
      try {
        const state = await deps.history.create({ ownerId: session.user.id, assetId, name: typeof body.name === "string" ? body.name : undefined });
        return Response.json(state, { status: 201 });
      } catch (error) {
        if (error instanceof Error && /not available to this owner/i.test(error.message)) {
          return Response.json({ code: "ASSET_NOT_FOUND" }, { status: 404 });
        }
        return Response.json({ code: "PROJECT_STORAGE_UNAVAILABLE", message: "The project could not be created. Retry the operation." }, { status: 503, headers: { "retry-after": "3" } });
      }
    },
  };
}

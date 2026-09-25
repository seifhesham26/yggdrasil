import { ZodError } from "zod";
import { isProjectStepName, projectStepNames, type ProjectStepStatus } from "@/features/projects/domain/project-state";
import type { ProjectHistory } from "@/features/projects/application/project-history";

type History = Pick<ProjectHistory, "load" | "save" | "undo" | "redo" | "setStep">;
type Session = { user: { id: string } } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validSteps(value: unknown): value is Partial<Record<(typeof projectStepNames)[number], { status: ProjectStepStatus; warningCount?: number }>> {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const statuses = ["not-started", "in-progress", "complete", "warning", "processing"];
  return Object.entries(value).every(([name, step]) => isProjectStepName(name) && isRecord(step) &&
    statuses.includes(String(step.status)) && (step.warningCount === undefined || (Number.isSafeInteger(step.warningCount) && Number(step.warningCount) >= 0 && Number(step.warningCount) <= 2_147_483_647)) &&
    Object.keys(step).every((key) => key === "status" || key === "warningCount"));
}

function failure(error: unknown): Response {
  if (error instanceof ZodError) return Response.json({ code: "INVALID_PROJECT_STATE", message: "The project state is invalid." }, { status: 400 });
  const message = error instanceof Error ? error.message : "Project operation failed.";
  if (/stale project revision/i.test(message)) return Response.json({ code: "STALE_PROJECT_REVISION", message }, { status: 409 });
  if (/not available to this owner/i.test(message)) return Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (/no (earlier|later|project revision)/i.test(message)) return Response.json({ code: "NO_PROJECT_HISTORY", message }, { status: 409 });
  return Response.json({ code: "PROJECT_STORAGE_UNAVAILABLE", message: "Project changes could not be saved. Your local edits remain unsaved; retry the operation." }, { status: 503, headers: { "retry-after": "3" } });
}

export function createProjectHandler(deps: { getSession: (headers: Headers) => Promise<Session>; history: History }) {
  return {
    async GET(projectId: string, request?: Request): Promise<Response> {
      const session = await deps.getSession(request?.headers ?? new Headers());
      if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      try {
        const project = await deps.history.load(session.user.id, projectId);
        return project ? Response.json(project) : Response.json({ code: "PROJECT_NOT_FOUND" }, { status: 404 });
      } catch (error) { return failure(error); }
    },
    async PATCH(projectId: string, request: Request): Promise<Response> {
      const session = await deps.getSession(request.headers);
      if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      let body: unknown;
      try { body = await request.json(); } catch { return Response.json({ code: "INVALID_JSON" }, { status: 400 }); }
      if (!isRecord(body) || typeof body.action !== "string") return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
      try {
        if (body.action === "save") {
          if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || !isProjectStepName(body.activeStep) || !validSteps(body.steps) || !("snapshot" in body)) {
            return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
          }
          return Response.json(await deps.history.save({ ownerId: session.user.id, projectId, expectedRevision: Number(body.expectedRevision), snapshot: body.snapshot, activeStep: body.activeStep, steps: body.steps }));
        }
        if (body.action === "undo" || body.action === "redo") return Response.json(await deps.history[body.action](session.user.id, projectId));
        if (body.action === "step" && isProjectStepName(body.activeStep)) return Response.json(await deps.history.setStep(session.user.id, projectId, body.activeStep));
        return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
      } catch (error) { return failure(error); }
    },
  };
}

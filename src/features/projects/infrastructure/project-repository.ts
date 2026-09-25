import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, assetVersions } from "@/db/schema/assets";
import { projectRevisions, projects, projectSteps } from "@/db/schema/projects";
import { defaultProjectSnapshot, parseProjectSnapshot, projectStepNames, type ProjectStepName, type ProjectStepStatus } from "../domain/project-state";
import type { Project, ProjectRepository, ProjectRevision, ProjectState, ProjectStep } from "../application/project-history";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function projectRecord(row: typeof projects.$inferSelect): Project {
  return { ...row, snapshot: parseProjectSnapshot(row.snapshot) };
}

async function ownedProject(tx: Transaction, ownerId: string, projectId: string, lock = false) {
  const query = tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new Error("Project is not available to this owner.");
  return row;
}

async function stateFor(tx: Transaction, row: typeof projects.$inferSelect): Promise<ProjectState> {
  const [revisions, steps] = await Promise.all([
    tx.select().from(projectRevisions).where(eq(projectRevisions.projectId, row.id)).orderBy(asc(projectRevisions.revision)),
    tx.select().from(projectSteps).where(eq(projectSteps.projectId, row.id)),
  ]);
  return {
    project: projectRecord(row),
    steps: steps.sort((left, right) => projectStepNames.indexOf(left.name) - projectStepNames.indexOf(right.name)).map((step) => ({ name: step.name, status: step.status, warningCount: step.warningCount, unsaved: false, updatedAt: step.updatedAt })) as ProjectStep[],
    revisions: revisions.map((revision) => ({ ...revision, snapshot: parseProjectSnapshot(revision.snapshot) })) as ProjectRevision[],
  };
}

export class DrizzleProjectRepository implements ProjectRepository {
  async listForAsset(ownerId: string, assetId: string): Promise<Project[]> {
    const rows = await db.select().from(projects).where(and(eq(projects.ownerId, ownerId), eq(projects.assetId, assetId))).orderBy(asc(projects.createdAt));
    return rows.map(projectRecord);
  }
  async create(input: { ownerId: string; assetId: string; name?: string }): Promise<ProjectState> {
    return db.transaction(async (tx) => {
      const [asset] = await tx.select({ id: assets.id, currentVersionId: assets.currentVersionId }).from(assets)
        .where(and(eq(assets.id, input.assetId), eq(assets.ownerId, input.ownerId), eq(assets.status, "ready"))).for("update");
      if (!asset?.currentVersionId) throw new Error("Asset is not available to this owner.");
      const [version] = await tx.select({ id: assetVersions.id }).from(assetVersions)
        .where(and(eq(assetVersions.id, asset.currentVersionId), eq(assetVersions.assetId, asset.id)));
      if (!version) throw new Error("Selected asset version is not retained.");
      const now = new Date();
      const [project] = await tx.insert(projects).values({ ownerId: input.ownerId, assetId: asset.id, assetVersionId: version.id, name: input.name?.trim() || "Untitled project", snapshot: defaultProjectSnapshot() }).returning();
      await tx.insert(projectSteps).values(projectStepNames.map((name, index) => ({
        projectId: project.id, name,
        status: index < 3 ? "complete" as const : name === "Appearance" ? "in-progress" as const : "not-started" as const,
        warningCount: 0, updatedAt: now,
      })));
      return stateFor(tx, project);
    });
  }

  async load(ownerId: string, projectId: string): Promise<ProjectState | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
      return row ? stateFor(tx, row) : null;
    });
  }

  async save(input: { ownerId: string; projectId: string; expectedRevision: number; snapshot: ProjectState["project"]["snapshot"]; activeStep: ProjectStepName; steps?: Partial<Record<ProjectStepName, { status: ProjectStepStatus; warningCount?: number }>> }): Promise<ProjectState> {
    return db.transaction(async (tx) => {
      const project = await ownedProject(tx, input.ownerId, input.projectId, true);
      if (project.revision !== input.expectedRevision) throw new Error("Stale project revision; reload before saving.");
      const revision = project.revision + 1;
      const [saved] = await tx.insert(projectRevisions).values({ projectId: project.id, parentRevisionId: project.currentRevisionId, revision, snapshot: input.snapshot }).returning();
      const now = new Date();
      const [updated] = await tx.update(projects).set({ revision, currentRevisionId: saved.id, snapshot: input.snapshot, activeStep: input.activeStep, updatedAt: now }).where(eq(projects.id, project.id)).returning();
      for (const name of projectStepNames) {
        const status = input.steps?.[name];
        if (status) await tx.update(projectSteps).set({ status: status.status, warningCount: status.warningCount, updatedAt: now }).where(and(eq(projectSteps.projectId, project.id), eq(projectSteps.name, name)));
        else if (name === input.activeStep) await tx.update(projectSteps).set({ status: "in-progress", updatedAt: now }).where(and(eq(projectSteps.projectId, project.id), eq(projectSteps.name, name), eq(projectSteps.status, "not-started")));
      }
      return stateFor(tx, updated);
    });
  }

  async undo(ownerId: string, projectId: string): Promise<ProjectState> {
    return db.transaction(async (tx) => {
      const project = await ownedProject(tx, ownerId, projectId, true);
      if (!project.currentRevisionId) throw new Error("No project revision is available to undo.");
      const [current] = await tx.select().from(projectRevisions).where(and(eq(projectRevisions.id, project.currentRevisionId), eq(projectRevisions.projectId, project.id)));
      if (!current) throw new Error("Project revision history is incomplete.");
      const [parent] = current.parentRevisionId ? await tx.select().from(projectRevisions).where(and(eq(projectRevisions.id, current.parentRevisionId), eq(projectRevisions.projectId, project.id))) : [null];
      if (current.parentRevisionId && !parent) throw new Error("Project revision history is incomplete.");
      const [updated] = await tx.update(projects).set({ currentRevisionId: parent?.id ?? null, snapshot: parent?.snapshot ?? defaultProjectSnapshot(), updatedAt: new Date() }).where(eq(projects.id, project.id)).returning();
      return stateFor(tx, updated);
    });
  }

  async redo(ownerId: string, projectId: string): Promise<ProjectState> {
    return db.transaction(async (tx) => {
      const project = await ownedProject(tx, ownerId, projectId, true);
      const current = project.currentRevisionId;
      const children = await tx.select().from(projectRevisions).where(and(eq(projectRevisions.projectId, project.id), current ? eq(projectRevisions.parentRevisionId, current) : isNull(projectRevisions.parentRevisionId))).orderBy(asc(projectRevisions.revision));
      const child = children.at(-1);
      if (!child) throw new Error("No later project revision is available to redo.");
      const [updated] = await tx.update(projects).set({ currentRevisionId: child.id, snapshot: child.snapshot, updatedAt: new Date() }).where(eq(projects.id, project.id)).returning();
      return stateFor(tx, updated);
    });
  }

  async setStep(ownerId: string, projectId: string, activeStep: ProjectStepName): Promise<ProjectState> {
    return db.transaction(async (tx) => {
      const project = await ownedProject(tx, ownerId, projectId, true); const now = new Date();
      await tx.update(projects).set({ activeStep, updatedAt: now }).where(eq(projects.id, project.id));
      await tx.update(projectSteps).set({ status: "in-progress", updatedAt: now }).where(and(eq(projectSteps.projectId, project.id), eq(projectSteps.name, activeStep), eq(projectSteps.status, "not-started")));
      const [updated] = await tx.select().from(projects).where(eq(projects.id, project.id));
      return stateFor(tx, updated);
    });
  }
}

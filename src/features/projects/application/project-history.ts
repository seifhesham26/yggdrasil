import { defaultProjectSnapshot, parseProjectSnapshot, type ProjectSnapshot, type ProjectStepName, type ProjectStepStatus, projectStepNames } from "../domain/project-state";

export type ProjectStep = { name: ProjectStepName; status: ProjectStepStatus; warningCount: number; unsaved: boolean; updatedAt: Date };
export type Project = { id: string; ownerId: string; assetId: string; assetVersionId: string; name: string; revision: number; currentRevisionId: string | null; activeStep: ProjectStepName; snapshot: ProjectSnapshot; createdAt: Date; updatedAt: Date };
export type ProjectRevision = { id: string; projectId: string; parentRevisionId: string | null; revision: number; snapshot: ProjectSnapshot; createdAt: Date };
export type ProjectState = { project: Project; steps: ProjectStep[]; revisions: ProjectRevision[] };

export interface ProjectRepository {
  create(input: { ownerId: string; assetId: string; name?: string }): Promise<ProjectState>;
  listForAsset(ownerId: string, assetId: string): Promise<Project[]>;
  load(ownerId: string, projectId: string): Promise<ProjectState | null>;
  save(input: { ownerId: string; projectId: string; expectedRevision: number; snapshot: ProjectSnapshot; activeStep: ProjectStepName; steps?: Partial<Record<ProjectStepName, { status: ProjectStepStatus; warningCount?: number }>> }): Promise<ProjectState>;
  undo(ownerId: string, projectId: string): Promise<ProjectState>;
  redo(ownerId: string, projectId: string): Promise<ProjectState>;
  setStep(ownerId: string, projectId: string, activeStep: ProjectStepName): Promise<ProjectState>;
}

export class ProjectHistory {
  constructor(private readonly repository: ProjectRepository) {}
  create(input: { ownerId: string; assetId: string; name?: string }) { return this.repository.create(input); }
  listForAsset(ownerId: string, assetId: string) { return this.repository.listForAsset(ownerId, assetId); }
  load(ownerId: string, projectId: string) { return this.repository.load(ownerId, projectId); }
  list(ownerId: string, projectId: string) { return this.repository.load(ownerId, projectId).then((state) => state ? { revisions: state.revisions, project: state.project, steps: state.steps } : null); }
  async save(input: { ownerId: string; projectId: string; expectedRevision: number; snapshot: unknown; activeStep: ProjectStepName; steps?: Partial<Record<ProjectStepName, { status: ProjectStepStatus; warningCount?: number }>> }) { return this.repository.save({ ...input, snapshot: parseProjectSnapshot(input.snapshot) }); }
  undo(ownerId: string, projectId: string) { return this.repository.undo(ownerId, projectId); }
  redo(ownerId: string, projectId: string) { return this.repository.redo(ownerId, projectId); }
  setStep(ownerId: string, projectId: string, activeStep: ProjectStepName) { return this.repository.setStep(ownerId, projectId, activeStep); }
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();
  private readonly revisions = new Map<string, ProjectRevision[]>();
  private readonly steps = new Map<string, ProjectStep[]>();
  private nextId = 1;
  constructor(private readonly assetVersions: Record<string, string>) {}
  private id() { return "project-" + this.nextId++; }
  private owned(ownerId: string, projectId: string) { const project = this.projects.get(projectId); if (!project || project.ownerId !== ownerId) throw new Error("Project is not available to this owner."); return project; }
  private state(project: Project): ProjectState { return { project: { ...project, snapshot: parseProjectSnapshot(project.snapshot) }, steps: [...(this.steps.get(project.id) ?? [])], revisions: [...(this.revisions.get(project.id) ?? [])] }; }
  async create(input: { ownerId: string; assetId: string; name?: string }): Promise<ProjectState> {
    const assetVersionId = this.assetVersions[input.assetId];
    if (!assetVersionId) throw new Error("An asset version fixture is required.");
    const now = new Date(); const project: Project = { id: this.id(), ownerId: input.ownerId, assetId: input.assetId, assetVersionId, name: input.name ?? "Untitled project", revision: 0, currentRevisionId: null, activeStep: "Appearance", snapshot: defaultProjectSnapshot(), createdAt: now, updatedAt: now };
    this.projects.set(project.id, project); this.revisions.set(project.id, []); this.steps.set(project.id, projectStepNames.map((name, index) => ({ name, status: index < 3 ? "complete" : name === "Appearance" ? "in-progress" : "not-started", warningCount: 0, unsaved: false, updatedAt: now })));
    return this.state(project);
  }
  async listForAsset(ownerId: string, assetId: string): Promise<Project[]> { return [...this.projects.values()].filter((project) => project.ownerId === ownerId && project.assetId === assetId); }
  async load(ownerId: string, projectId: string) { const project = this.projects.get(projectId); return !project || project.ownerId !== ownerId ? null : this.state(project); }
  async save(input: { ownerId: string; projectId: string; expectedRevision: number; snapshot: ProjectSnapshot; activeStep: ProjectStepName; steps?: Partial<Record<ProjectStepName, { status: ProjectStepStatus; warningCount?: number }>> }): Promise<ProjectState> {
    const project = this.owned(input.ownerId, input.projectId); if (project.revision !== input.expectedRevision) throw new Error("Stale project revision; reload before saving.");
    const now = new Date(); const revision: ProjectRevision = { id: this.id(), projectId: project.id, parentRevisionId: project.currentRevisionId, revision: project.revision + 1, snapshot: parseProjectSnapshot(input.snapshot), createdAt: now };
    this.revisions.get(project.id)!.push(revision); Object.assign(project, { revision: revision.revision, currentRevisionId: revision.id, activeStep: input.activeStep, snapshot: revision.snapshot, updatedAt: now }); this.updateSteps(project.id, input.activeStep, input.steps, now); return this.state(project);
  }
  private updateSteps(projectId: string, activeStep: ProjectStepName, updates: Partial<Record<ProjectStepName, { status: ProjectStepStatus; warningCount?: number }>> | undefined, now: Date) { const current = this.steps.get(projectId)!; for (const step of current) { const update = updates?.[step.name]; if (update) { step.status = update.status; step.warningCount = update.warningCount ?? step.warningCount; } else if (step.name === activeStep && step.status === "not-started") step.status = "in-progress"; step.updatedAt = now; } }
  async undo(ownerId: string, projectId: string): Promise<ProjectState> { const project = this.owned(ownerId, projectId); if (!project.currentRevisionId) throw new Error("No project revision is available to undo."); const current = this.revisions.get(project.id)!.find((revision) => revision.id === project.currentRevisionId)!; const parent = current.parentRevisionId ? this.revisions.get(project.id)!.find((revision) => revision.id === current.parentRevisionId) : null; if (current.parentRevisionId && !parent) throw new Error("Project revision history is incomplete."); Object.assign(project, { currentRevisionId: parent?.id ?? null, snapshot: parent?.snapshot ?? defaultProjectSnapshot(), updatedAt: new Date() }); return this.state(project); }
  async redo(ownerId: string, projectId: string): Promise<ProjectState> { const project = this.owned(ownerId, projectId); const child = this.revisions.get(project.id)!.filter((revision) => revision.parentRevisionId === project.currentRevisionId).sort((a, b) => b.revision - a.revision)[0]; if (!child) throw new Error("No later project revision is available to redo."); Object.assign(project, { currentRevisionId: child.id, snapshot: child.snapshot, updatedAt: new Date() }); return this.state(project); }
  async setStep(ownerId: string, projectId: string, activeStep: ProjectStepName): Promise<ProjectState> { const project = this.owned(ownerId, projectId); project.activeStep = activeStep; project.updatedAt = new Date(); this.updateSteps(project.id, activeStep, undefined, project.updatedAt); return this.state(project); }
}

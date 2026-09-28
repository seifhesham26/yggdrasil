import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { assetFiles, assetVersions } from "@/db/schema/assets";
import { exportArtifacts, exportJobs } from "@/db/schema/exports";
import { projects } from "@/db/schema/projects";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { variantSourcePath } from "@/features/assets/application/variant-switch";
import type { StoredAssetFile } from "@/features/assets/infrastructure/asset-repository";
import type { ExportArtifact, ExportJob, ExportKind, ExportRepository } from "../application/export-service";
import type { VersionFile } from "../domain/export-manifest";

function jobRecord(row: typeof exportJobs.$inferSelect): ExportJob { return { ...row, manifest: row.manifest ?? null }; }

export class DrizzleExportRepository implements ExportRepository {
  async create(ownerId: string, projectId: string, target: ExportKind): Promise<ExportJob | null> {
    return db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
      if (!project) return null;
      const [version] = await tx.select({ id: assetVersions.id }).from(assetVersions).where(and(eq(assetVersions.id, project.assetVersionId), eq(assetVersions.assetId, project.assetId)));
      if (!version) return null;
      const [row] = await tx.insert(exportJobs).values({ ownerId, projectId, projectName: project.name, projectRevision: project.revision,
        projectRevisionId: project.currentRevisionId, assetVersionId: version.id, snapshot: project.snapshot, target, status: "queued" }).returning();
      return jobRecord(row);
    });
  }

  async list(ownerId: string, projectId: string): Promise<ExportJob[]> {
    const rows = await db.select().from(exportJobs).where(and(eq(exportJobs.ownerId, ownerId), eq(exportJobs.projectId, projectId))).orderBy(desc(exportJobs.createdAt));
    return rows.map(jobRecord);
  }

  async get(ownerId: string, jobId: string): Promise<ExportJob | null> {
    const [row] = await db.select().from(exportJobs).where(and(eq(exportJobs.id, jobId), eq(exportJobs.ownerId, ownerId)));
    return row ? jobRecord(row) : null;
  }

  async claim(ownerId: string, jobId: string): Promise<ExportJob | null> {
    const now = new Date();
    const [row] = await db.update(exportJobs).set({ status: "building", errorCode: null, leaseUntil: new Date(now.getTime() + 5 * 60_000), updatedAt: now })
      .where(and(eq(exportJobs.id, jobId), eq(exportJobs.ownerId, ownerId), or(eq(exportJobs.status, "queued"), eq(exportJobs.status, "failed"), and(eq(exportJobs.status, "building"), lt(exportJobs.leaseUntil, now))))).returning();
    return row ? jobRecord(row) : null;
  }

  async sources(job: ExportJob): Promise<{ version: VersionFile; files: StoredAssetFile[] }> {
    const [row] = await db.select({ version: assetVersions }).from(assetVersions).innerJoin(projects, and(eq(projects.assetId, assetVersions.assetId), eq(projects.id, job.projectId)))
      .where(and(eq(assetVersions.id, job.assetVersionId), eq(projects.ownerId, job.ownerId)));
    if (!row) throw new Error("Retained asset version is missing.");
    const sourceFiles = await db.select({ relativePath: assetFiles.relativePath, storageKey: assetFiles.storageKey, byteSize: assetFiles.byteSize,
      sha256: assetFiles.sha256, mimeType: assetFiles.mimeType, role: assetFiles.role }).from(assetFiles).where(eq(assetFiles.sourceId, row.version.sourceId));
    const original = sourceFiles.find((file) => file.storageKey === row.version.storageKey);
    const version: VersionFile = { id: row.version.id, storageKey: row.version.storageKey,
      relativePath: original?.relativePath ?? variantSourcePath(row.version.storageKey) ?? (row.version.mimeType === "model/gltf-binary" ? "model.glb" : "model.gltf"),
      byteSize: row.version.byteSize, sha256: row.version.sha256, mimeType: row.version.mimeType };
    return { version, files: sourceFiles };
  }

  async complete(ownerId: string, jobId: string, manifest: ExportJob["manifest"] & object, artifact: ExportArtifact): Promise<ExportJob> {
    return db.transaction(async (tx) => {
      const [job] = await tx.select().from(exportJobs).where(and(eq(exportJobs.id, jobId), eq(exportJobs.ownerId, ownerId), eq(exportJobs.status, "building"))).for("update");
      if (!job) throw new Error("Export job is no longer building.");
      await tx.insert(exportArtifacts).values({ jobId, kind: artifact.kind, storageKey: artifact.storageKey, sha256: artifact.sha256, byteSize: artifact.byteSize, mimeType: artifact.mimeType })
        .onConflictDoUpdate({ target: [exportArtifacts.jobId, exportArtifacts.kind], set: { storageKey: artifact.storageKey, sha256: artifact.sha256, byteSize: artifact.byteSize, mimeType: artifact.mimeType } });
      const [updated] = await tx.update(exportJobs).set({ status: "ready", manifest, errorCode: null, leaseUntil: null, updatedAt: new Date() }).where(eq(exportJobs.id, jobId)).returning();
      return jobRecord(updated);
    });
  }

  async fail(ownerId: string, jobId: string, code: string): Promise<ExportJob> {
    const [row] = await db.update(exportJobs).set({ status: "failed", errorCode: code, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(exportJobs.id, jobId), eq(exportJobs.ownerId, ownerId), eq(exportJobs.status, "building"))).returning();
    if (!row) throw new Error("Export job is no longer building.");
    return jobRecord(row);
  }

  async artifact(ownerId: string, jobId: string): Promise<ExportArtifact | null> {
    const [row] = await db.select({ artifact: exportArtifacts }).from(exportArtifacts).innerJoin(exportJobs, eq(exportJobs.id, exportArtifacts.jobId))
      .where(and(eq(exportJobs.id, jobId), eq(exportJobs.ownerId, ownerId), eq(exportJobs.status, "ready"), eq(exportArtifacts.kind, exportJobs.target)));
    return row ? { ...row.artifact, storageKey: parseStorageKey(row.artifact.storageKey) } : null;
  }
}

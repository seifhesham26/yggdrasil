import { createHash, randomUUID } from "node:crypto";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";
import { buildExportManifest, type ExportManifest, type VersionFile } from "../domain/export-manifest";
import type { StoredAssetFile } from "@/features/assets/infrastructure/asset-repository";
import { buildReactBundle } from "../infrastructure/react-bundle";
import { buildEmbedBundle } from "../infrastructure/embed-bundle";

export type ExportStatus = "queued" | "building" | "ready" | "failed";
export type ExportKind = "manifest" | "react" | "embed" | "package";
export type ExportJob = {
  id: string; ownerId: string; projectId: string; projectName: string; projectRevision: number; projectRevisionId: string | null;
  assetVersionId: string; snapshot: ProjectSnapshot; target: ExportKind; status: ExportStatus; manifest: ExportManifest | null;
  errorCode: string | null; createdAt: Date; updatedAt: Date;
};
export type ExportArtifact = { jobId: string; kind: ExportKind; storageKey: StorageKey; sha256: string; byteSize: number; mimeType: string };
export interface ExportRepository {
  create(ownerId: string, projectId: string, target: ExportKind): Promise<ExportJob | null>;
  list(ownerId: string, projectId: string): Promise<ExportJob[]>;
  get(ownerId: string, jobId: string): Promise<ExportJob | null>;
  claim(ownerId: string, jobId: string): Promise<ExportJob | null>;
  sources(job: ExportJob): Promise<{ version: VersionFile; files: StoredAssetFile[] }>;
  complete(ownerId: string, jobId: string, manifest: ExportManifest, artifact: ExportArtifact): Promise<ExportJob>;
  fail(ownerId: string, jobId: string, code: string): Promise<ExportJob>;
  artifact(ownerId: string, jobId: string): Promise<ExportArtifact | null>;
}

export function publicExportJob(job: ExportJob) {
  return { id: job.id, projectId: job.projectId, projectRevision: job.projectRevision, projectRevisionId: job.projectRevisionId, assetVersionId: job.assetVersionId,
    target: job.target, status: job.status, errorCode: job.errorCode, manifest: job.manifest, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString() };
}

export class ExportService {
  constructor(private readonly repository: ExportRepository, private readonly storage: Pick<AssetStorage, "read" | "put">) {}
  list(ownerId: string, projectId: string) { return this.repository.list(ownerId, projectId); }
  get(ownerId: string, jobId: string) { return this.repository.get(ownerId, jobId); }
  artifact(ownerId: string, jobId: string) { return this.repository.artifact(ownerId, jobId); }

  async create(ownerId: string, projectId: string, target: ExportKind = "manifest"): Promise<ExportJob | null> {
    const job = await this.repository.create(ownerId, projectId, target);
    return job ? this.build(ownerId, job.id) : null;
  }

  async retry(ownerId: string, jobId: string): Promise<ExportJob | null> {
    return this.build(ownerId, jobId);
  }

  private async build(ownerId: string, jobId: string): Promise<ExportJob | null> {
    const job = await this.repository.claim(ownerId, jobId);
    if (!job) return null;
    try {
      if (job.target !== "manifest" && job.target !== "react" && job.target !== "embed") throw new Error("Export target is not yet supported.");
      const { version, files } = await this.repository.sources(job);
      const { manifest, files: resolvedFiles } = await buildExportManifest({ id: job.projectId, name: job.projectName, revision: job.projectRevision,
        currentRevisionId: job.projectRevisionId, assetVersionId: job.assetVersionId, snapshot: job.snapshot }, version, files, this.storage, job.createdAt);
      const bytes = job.target === "react" ? await buildReactBundle(manifest, resolvedFiles, this.storage) : job.target === "embed" ? await buildEmbedBundle(manifest, resolvedFiles, this.storage) : new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");
      const storageKey = parseStorageKey(`exports/${job.id}/${randomUUID()}/${job.target === "manifest" ? "manifest.json" : `${job.target}.zip`}`);
      await this.storage.put(storageKey, bytes);
      return this.repository.complete(ownerId, jobId, manifest, { jobId, kind: job.target, storageKey, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength, mimeType: job.target === "manifest" ? "application/json" : "application/zip" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export build failed.";
      const code = /missing|changed|ENOENT/i.test(message) ? "SOURCE_UNAVAILABLE" : /unsupported|invalid|unsafe|secret|Critical asset|exceeds|mismatch/i.test(message) ? "INVALID_EXPORT" : "EXPORT_BUILD_FAILED";
      return this.repository.fail(ownerId, jobId, code);
    }
  }
}

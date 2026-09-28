import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { assetVersions } from "./assets";
import { projects, projectRevisions } from "./projects";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import type { ExportManifest } from "@/features/exports/domain/export-manifest";

export const exportJobStatus = pgEnum("export_job_status", ["queued", "building", "ready", "failed"]);
export const exportTarget = pgEnum("export_target", ["manifest", "react", "embed", "package"]);

export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  projectName: text("project_name").notNull(),
  projectRevision: integer("project_revision").notNull(),
  projectRevisionId: uuid("project_revision_id").references(() => projectRevisions.id, { onDelete: "set null" }),
  assetVersionId: uuid("asset_version_id").notNull().references(() => assetVersions.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<ProjectSnapshot>().notNull(),
  target: exportTarget("target").notNull(),
  status: exportJobStatus("status").default("queued").notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  manifest: jsonb("manifest").$type<ExportManifest | null>(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("export_jobs_owner_project_idx").on(table.ownerId, table.projectId, table.createdAt)]);

export const exportArtifacts = pgTable("export_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => exportJobs.id, { onDelete: "cascade" }),
  kind: exportTarget("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("export_artifacts_job_kind_uq").on(table.jobId, table.kind)]);

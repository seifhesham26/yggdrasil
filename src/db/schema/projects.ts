import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { assets, assetVersions } from "./assets";
import type { ProjectSnapshot, ProjectStepName, ProjectStepStatus } from "@/features/projects/domain/project-state";

export const projectStep = pgEnum("project_step", ["Import", "Analyze", "Optimize", "Appearance", "Scene", "Interactions", "Animate", "Export"]);
export const projectStepStatus = pgEnum("project_step_status", ["not-started", "in-progress", "complete", "warning", "processing"]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  assetVersionId: uuid("asset_version_id").notNull().references(() => assetVersions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  revision: integer("revision").default(0).notNull(),
  currentRevisionId: uuid("current_revision_id"),
  activeStep: projectStep("active_step").default("Appearance").notNull(),
  snapshot: jsonb("snapshot").$type<ProjectSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt), index("projects_asset_idx").on(table.assetId)]);

export const projectRevisions = pgTable("project_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentRevisionId: uuid("parent_revision_id"),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").$type<ProjectSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("project_revisions_project_revision_uq").on(table.projectId, table.revision), index("project_revisions_parent_idx").on(table.projectId, table.parentRevisionId)]);

export const projectSteps = pgTable("project_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: projectStep("name").$type<ProjectStepName>().notNull(),
  status: projectStepStatus("status").$type<ProjectStepStatus>().default("not-started").notNull(),
  warningCount: integer("warning_count").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("project_steps_project_name_uq").on(table.projectId, table.name)]);

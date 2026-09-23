import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import type { AssetAnalysis } from "@/features/assets/domain/types";

export const assetStatus = pgEnum("asset_status", ["importing", "ready", "failed"]);
export const assetFileRole = pgEnum("asset_file_role", ["model", "dependency", "attribution"]);
export const assetVersionKind = pgEnum("asset_version_kind", ["original", "optimized", "converted"]);

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: assetStatus("status").default("importing").notNull(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("assets_owner_created_idx").on(table.ownerId, table.createdAt)]);

export const assetSources = pgTable("asset_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("asset_sources_storage_key_uq").on(table.storageKey), index("asset_sources_asset_idx").on(table.assetId)]);

export const assetFiles = pgTable("asset_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => assetSources.id, { onDelete: "cascade" }),
  relativePath: text("relative_path").notNull(),
  storageKey: text("storage_key").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  mimeType: text("mime_type").notNull(),
  role: assetFileRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("asset_files_storage_key_uq").on(table.storageKey),
  uniqueIndex("asset_files_source_path_uq").on(table.sourceId, table.relativePath),
]);

export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => assetSources.id, { onDelete: "cascade" }),
  kind: assetVersionKind("kind").default("original").notNull(),
  storageKey: text("storage_key").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("asset_versions_storage_key_uq").on(table.storageKey), index("asset_versions_asset_idx").on(table.assetId)]);

export const sceneAnalyses = pgTable("scene_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => assetVersions.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").$type<AssetAnalysis>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("scene_analyses_asset_idx").on(table.assetId)]);

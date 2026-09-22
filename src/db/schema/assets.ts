import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assetSources = pgTable("asset_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  storageKey: text("storage_key").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assetFiles = pgTable("asset_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => assetSources.id),
  relativePath: text("relative_path").notNull(),
  storageKey: text("storage_key").notNull(),
  byteSize: integer("byte_size").notNull(),
});

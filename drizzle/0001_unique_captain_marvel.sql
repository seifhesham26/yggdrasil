CREATE TYPE "public"."asset_file_role" AS ENUM('model', 'dependency', 'attribution');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('importing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_version_kind" AS ENUM('original', 'optimized', 'converted');--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" "asset_version_kind" DEFAULT 'original' NOT NULL,
	"storage_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_files" DROP CONSTRAINT "asset_files_source_id_asset_sources_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_sources" DROP CONSTRAINT "asset_sources_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_files" ALTER COLUMN "byte_size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "asset_sources" ALTER COLUMN "byte_size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "asset_files" ADD COLUMN "sha256" text NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_files" ADD COLUMN "mime_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_files" ADD COLUMN "role" "asset_file_role" NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_files" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "owner_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" "asset_status" DEFAULT 'importing' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_source_id_asset_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."asset_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_storage_key_uq" ON "asset_versions" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "asset_versions_asset_idx" ON "asset_versions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "scene_analyses_asset_idx" ON "scene_analyses" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_source_id_asset_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."asset_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_sources" ADD CONSTRAINT "asset_sources_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_files_storage_key_uq" ON "asset_files" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_files_source_path_uq" ON "asset_files" USING btree ("source_id","relative_path");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_sources_storage_key_uq" ON "asset_sources" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "asset_sources_asset_idx" ON "asset_sources" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_owner_created_idx" ON "assets" USING btree ("owner_id","created_at");
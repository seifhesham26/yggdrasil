CREATE TYPE "public"."project_step" AS ENUM('Import', 'Analyze', 'Optimize', 'Appearance', 'Scene', 'Interactions', 'Animate', 'Export');--> statement-breakpoint
CREATE TYPE "public"."project_step_status" AS ENUM('not-started', 'in-progress', 'complete', 'warning', 'processing');--> statement-breakpoint
CREATE TABLE "project_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_revision_id" uuid,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" "project_step" NOT NULL,
	"status" "project_step_status" DEFAULT 'not-started' NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"asset_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"current_revision_id" uuid,
	"active_step" "project_step" DEFAULT 'Appearance' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_asset_version_id_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_revisions_project_revision_uq" ON "project_revisions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE INDEX "project_revisions_parent_idx" ON "project_revisions" USING btree ("project_id","parent_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_steps_project_name_uq" ON "project_steps" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_asset_idx" ON "projects" USING btree ("asset_id");
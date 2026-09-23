CREATE TYPE "public"."optimization_operation_status" AS ENUM('approved', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "optimization_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"code" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "optimization_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"parent_version_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" "optimization_operation_status" NOT NULL,
	"error_message" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_bytes" integer,
	"output_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "parent_version_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "optimization_findings" ADD CONSTRAINT "optimization_findings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_operations" ADD CONSTRAINT "optimization_operations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_operations" ADD CONSTRAINT "optimization_operations_parent_version_id_asset_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimization_findings_asset_idx" ON "optimization_findings" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "optimization_operations_asset_idx" ON "optimization_operations" USING btree ("asset_id","created_at");

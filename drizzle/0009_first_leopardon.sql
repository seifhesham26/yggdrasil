ALTER TABLE "export_jobs" ADD COLUMN "project_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "lease_until" timestamp with time zone;
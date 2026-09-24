ALTER TABLE "import_jobs" ADD COLUMN "candidates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "selected_model_path" text;

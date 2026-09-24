CREATE TYPE "public"."import_job_phase" AS ENUM('received', 'staging', 'analyzing', 'committing', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"upload_prefix" text NOT NULL,
	"files" jsonb NOT NULL,
	"phase" "import_job_phase" DEFAULT 'received' NOT NULL,
	"next_file" integer DEFAULT 0 NOT NULL,
	"processed_bytes" bigint DEFAULT 0 NOT NULL,
	"total_bytes" bigint NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"asset_id" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_owner_phase_idx" ON "import_jobs" USING btree ("owner_id","phase");

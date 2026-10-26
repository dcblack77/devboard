ALTER TABLE "pull_requests" ADD COLUMN "base_ref" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "first_commit_at" timestamp with time zone;
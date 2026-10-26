CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"name" text,
	"event" text,
	"status" text,
	"conclusion" text,
	"head_branch" text,
	"head_sha" text,
	"run_attempt" integer,
	"created_at" timestamp with time zone NOT NULL,
	"run_started_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "deploy_workflow" text DEFAULT 'Deployment' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "deploy_branches" text DEFAULT '^main$|hotfix' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ci_workflow_regex" text DEFAULT '^CI' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "feature_base" text DEFAULT 'develop' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_repo_name_created_at_idx" ON "workflow_runs" USING btree ("repo","name","created_at");
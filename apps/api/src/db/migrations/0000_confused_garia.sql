CREATE TABLE IF NOT EXISTS "epics" (
	"key" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"assignee_raw" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "initiative_epics" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL,
	"epic_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "initiatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "initiatives_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue_assignee_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"to_raw" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue_status_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_key" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"seq" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issues" (
	"key" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"status_norm" text NOT NULL,
	"macro" text NOT NULL,
	"assignee_raw" text,
	"person_id" integer,
	"parent_key" text,
	"parent_type" text,
	"epic_key" text,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"jira_names" text[] DEFAULT '{}' NOT NULL,
	"github_logins" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pr_review_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"requested_login" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pr_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"reviewer_login" text NOT NULL,
	"reviewer_person_id" integer,
	"state" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"is_bot" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"author_login" text,
	"author_person_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"merged_by_login" text,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changed_files" integer DEFAULT 0 NOT NULL,
	"head_ref" text,
	"erf_keys" text[] DEFAULT '{}' NOT NULL,
	"hotfix" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"jira_project" text,
	"since_date" text,
	"sync_minutes" integer DEFAULT 30 NOT NULL,
	"attention_days" integer DEFAULT 5 NOT NULL,
	"review_days" integer DEFAULT 2 NOT NULL,
	"wait_review_hours" integer DEFAULT 24 NOT NULL,
	"thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_flow" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status_aliases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"macro_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counted_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hotfix_regex" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"error" text,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "initiative_epics" ADD CONSTRAINT "initiative_epics_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_assignee_changes" ADD CONSTRAINT "issue_assignee_changes_issue_key_issues_key_fk" FOREIGN KEY ("issue_key") REFERENCES "public"."issues"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_status_segments" ADD CONSTRAINT "issue_status_segments_issue_key_issues_key_fk" FOREIGN KEY ("issue_key") REFERENCES "public"."issues"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pr_review_requests" ADD CONSTRAINT "pr_review_requests_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pr_reviews" ADD CONSTRAINT "pr_reviews_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

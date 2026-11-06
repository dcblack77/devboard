CREATE TABLE IF NOT EXISTS "support_tickets" (
	"key" text PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"summary" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"priority" text,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"assignee_raw" text,
	"reporter_raw" text,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"linked_keys" text[] DEFAULT '{}' NOT NULL,
	"status_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "support_project" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "support_tech_status" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "support_sla" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_project_idx" ON "support_tickets" USING btree ("project");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_created_at_idx" ON "support_tickets" USING btree ("created_at");
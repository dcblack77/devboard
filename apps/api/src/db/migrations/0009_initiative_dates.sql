ALTER TABLE "epics" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "epics" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "epics" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "story_points" double precision;
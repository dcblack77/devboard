ALTER TABLE "initiatives" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "epic_key" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_epic_key_unique" UNIQUE("epic_key");
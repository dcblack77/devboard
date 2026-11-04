CREATE TABLE IF NOT EXISTS "person_skills" (
	"person_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"level" smallint NOT NULL,
	"source" text NOT NULL,
	"evidence" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_skills_person_id_skill_id_pk" PRIMARY KEY("person_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "seniority" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skills" ADD CONSTRAINT "person_skills_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skills" ADD CONSTRAINT "person_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

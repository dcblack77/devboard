ALTER TABLE "settings" ADD COLUMN "jira_boards" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Copia los tableros antiguos a la lista: jira_project -> dev, support_project -> support (sin nulos/vacíos).
UPDATE "settings" SET "jira_boards" = COALESCE(
  (
    SELECT jsonb_agg(v.board ORDER BY v.ord)
    FROM (
      VALUES
        (1, CASE WHEN NULLIF(btrim("settings"."jira_project"), '') IS NOT NULL
              THEN jsonb_build_object('key', upper(btrim("settings"."jira_project")), 'kind', 'dev') END),
        (2, CASE WHEN NULLIF(btrim("settings"."support_project"), '') IS NOT NULL
                  AND upper(btrim("settings"."support_project")) IS DISTINCT FROM upper(btrim(COALESCE("settings"."jira_project", '')))
              THEN jsonb_build_object('key', upper(btrim("settings"."support_project")), 'kind', 'support') END)
    ) AS v(ord, board)
    WHERE v.board IS NOT NULL
  ),
  '[]'::jsonb
);--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "jira_project";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "support_project";
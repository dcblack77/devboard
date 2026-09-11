CREATE INDEX IF NOT EXISTS "issue_status_segments_issue_key_idx" ON "issue_status_segments" USING btree ("issue_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_person_id_idx" ON "issues" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_epic_key_idx" ON "issues" USING btree ("epic_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_reviews_pr_id_reviewer_login_idx" ON "pr_reviews" USING btree ("pr_id","reviewer_login");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pull_requests_author_login_merged_at_idx" ON "pull_requests" USING btree ("author_login","merged_at");
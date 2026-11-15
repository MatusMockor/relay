ALTER TABLE "ai_jobs" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "normalized_subject" text;--> statement-breakpoint
CREATE INDEX "ai_jobs_queue_idx" ON "ai_jobs" USING btree ("runner_location","status","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_pending_idx" ON "ai_jobs" USING btree ("user_id","kind","thread_id","status");--> statement-breakpoint
CREATE INDEX "messages_account_subject_idx" ON "messages" USING btree ("account_id","normalized_subject","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_attachments_idx" ON "messages" USING gin ("attachments" jsonb_path_ops);--> statement-breakpoint
UPDATE "ai_jobs" SET "thread_id" = "input"->>'threadId' WHERE "input" ? 'threadId';
--> statement-breakpoint
UPDATE "ai_jobs" SET "lease_until" = to_timestamp(0) WHERE "status" = 'running';

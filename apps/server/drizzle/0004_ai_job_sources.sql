DROP INDEX "ai_jobs_pending_idx";--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "source_message_id" text;--> statement-breakpoint
ALTER TABLE "ai_results" ADD COLUMN "source_message_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_active_source_idx" ON "ai_jobs" USING btree ("user_id","thread_id","kind","source_message_id") WHERE status in ('queued', 'running') and source_message_id is not null;
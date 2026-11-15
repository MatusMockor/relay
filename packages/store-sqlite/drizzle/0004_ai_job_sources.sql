DROP INDEX `ai_jobs_pending_idx`;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `source_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_jobs_active_source_idx` ON `ai_jobs` (`user_id`,`thread_id`,`kind`,`source_message_id`) WHERE status in ('queued', 'running') and source_message_id is not null;--> statement-breakpoint
ALTER TABLE `ai_results` ADD `source_message_id` text;
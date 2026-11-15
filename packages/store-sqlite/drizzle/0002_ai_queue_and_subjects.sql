ALTER TABLE `ai_jobs` ADD `created_ts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `claimed_by` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `lease_until_ts` integer;--> statement-breakpoint
CREATE INDEX `ai_jobs_queue_idx` ON `ai_jobs` (`runner_location`,`status`,`created_ts`);--> statement-breakpoint
CREATE INDEX `ai_jobs_pending_idx` ON `ai_jobs` (`user_id`,`kind`,`thread_id`,`status`);--> statement-breakpoint
ALTER TABLE `messages` ADD `normalized_subject` text;--> statement-breakpoint
CREATE INDEX `messages_account_subject_idx` ON `messages` (`account_id`,`normalized_subject`,`date_ts`);--> statement-breakpoint
UPDATE `ai_jobs` SET `created_ts` = CAST(ROUND((julianday(`created_at`) - 2440587.5) * 86400000) AS INTEGER), `thread_id` = json_extract(`input`, '$.threadId');
--> statement-breakpoint
UPDATE `ai_jobs` SET `lease_until_ts` = 0 WHERE `status` = 'running';

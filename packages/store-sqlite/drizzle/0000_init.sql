CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`color` text NOT NULL,
	`is_primary` integer NOT NULL,
	`sync_interval_seconds` integer NOT NULL,
	`settings` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`last_synced_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_email_unique` ON `accounts` (`user_id`,lower("email"));--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`runner_location` text NOT NULL,
	`runner` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_user_idx` ON `ai_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_results` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text,
	`kind` text NOT NULL,
	`runner` text NOT NULL,
	`output` text NOT NULL,
	`created_at` text NOT NULL,
	`created_ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_results_latest_idx` ON `ai_results` (`user_id`,`thread_id`,`kind`,`created_ts`);--> statement-breakpoint
CREATE INDEX `ai_results_thread_idx` ON `ai_results` (`thread_id`);--> statement-breakpoint
CREATE TABLE `draft_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `draft_attachments_draft_idx` ON `draft_attachments` (`draft_id`,`position`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`to` text NOT NULL,
	`cc` text NOT NULL,
	`bcc` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`in_reply_to_thread_id` text,
	`in_reply_to_message_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_ts` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drafts_user_order_idx` ON `drafts` (`user_id`,`updated_ts`);--> statement-breakpoint
CREATE INDEX `drafts_thread_idx` ON `drafts` (`in_reply_to_thread_id`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_account_name_unique` ON `labels` (`account_id`,`name`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`delimiter` text,
	`role` text NOT NULL,
	`unread_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_account_path_unique` ON `mailboxes` (`account_id`,`path`);--> statement-breakpoint
CREATE INDEX `mailboxes_account_role_idx` ON `mailboxes` (`account_id`,`role`);--> statement-breakpoint
CREATE TABLE `message_labels` (
	`message_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `label_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_labels_label_idx` ON `message_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`seq` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`account_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`uid` integer NOT NULL,
	`message_id_header` text,
	`in_reply_to` text,
	`references` text NOT NULL,
	`from_name` text,
	`from_email` text,
	`to` text NOT NULL,
	`cc` text NOT NULL,
	`bcc` text NOT NULL,
	`reply_to` text NOT NULL,
	`subject` text NOT NULL,
	`date` text NOT NULL,
	`date_ts` integer NOT NULL,
	`snippet` text NOT NULL,
	`text_body` text,
	`html_body` text,
	`seen` integer NOT NULL,
	`flagged` integer NOT NULL,
	`answered` integer NOT NULL,
	`attachments` text NOT NULL,
	`headers` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_id_unique` ON `messages` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_mailbox_uid_unique` ON `messages` (`mailbox_id`,`uid`);--> statement-breakpoint
CREATE INDEX `messages_thread_date_idx` ON `messages` (`thread_id`,`date_ts`);--> statement-breakpoint
CREATE INDEX `messages_account_header_idx` ON `messages` (`account_id`,`message_id_header`);--> statement-breakpoint
CREATE INDEX `messages_user_idx` ON `messages` (`user_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`remind_at` text NOT NULL,
	`remind_ts` integer NOT NULL,
	`fired_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`fired_at`,`remind_ts`);--> statement-breakpoint
CREATE INDEX `reminders_thread_idx` ON `reminders` (`thread_id`);--> statement-breakpoint
CREATE TABLE `scheduled_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`scheduled_ts` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scheduled_sends_status_due_idx` ON `scheduled_sends` (`status`,`scheduled_ts`);--> statement-breakpoint
CREATE INDEX `scheduled_sends_user_idx` ON `scheduled_sends` (`user_id`,`status`,`scheduled_ts`);--> statement-breakpoint
CREATE INDEX `scheduled_sends_draft_idx` ON `scheduled_sends` (`draft_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `splits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`rules` text NOT NULL,
	`exclusive` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `splits_user_position_idx` ON `splits` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`uid_validity` integer NOT NULL,
	`last_uid` integer NOT NULL,
	`highest_modseq` text,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_state_account_idx` ON `sync_state` (`account_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text,
	`jira_key` text,
	`title` text NOT NULL,
	`ai_what` text,
	`state` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_ts` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_user_order_idx` ON `tasks` (`user_id`,`updated_ts`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_thread_idx` ON `tasks` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_user_jira_unique` ON `tasks` (`user_id`,`jira_key`) WHERE "tasks"."jira_key" is not null;--> statement-breakpoint
CREATE TABLE `thread_splits` (
	`thread_id` text NOT NULL,
	`split_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `split_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thread_splits_split_idx` ON `thread_splits` (`split_id`,`thread_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`subject` text NOT NULL,
	`participants` text NOT NULL,
	`last_message_at` text NOT NULL,
	`last_message_ts` integer NOT NULL,
	`message_count` integer NOT NULL,
	`unread` integer NOT NULL,
	`snippet` text NOT NULL,
	`ai_one_liner` text,
	`jira_key` text,
	`label_ids` text NOT NULL,
	`state` text NOT NULL,
	`remind_at` text,
	`has_draft` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `threads_user_state_order_idx` ON `threads` (`user_id`,`state`,`last_message_ts`,`id`);--> statement-breakpoint
CREATE INDEX `threads_account_state_order_idx` ON `threads` (`account_id`,`state`,`last_message_ts`,`id`);
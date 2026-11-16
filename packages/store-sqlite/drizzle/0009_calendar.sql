CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`subscription_id` text,
	`series_key` text NOT NULL,
	`uid` text NOT NULL,
	`recurrence_key` text NOT NULL,
	`recurrence_id` text,
	`sequence` integer NOT NULL,
	`dtstamp` text,
	`method` text,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`location` text,
	`description` text,
	`organizer` text,
	`attendees` text NOT NULL,
	`my_partstat` text,
	`my_email` text,
	`all_day` integer NOT NULL,
	`starts_at` text NOT NULL,
	`starts_ts` integer NOT NULL,
	`ends_at` text NOT NULL,
	`recurring` integer NOT NULL,
	`range_ends_at` text,
	`range_ends_ts` integer,
	`ics` text NOT NULL,
	`message_id` text,
	`thread_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `calendar_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_series_recurrence_unique` ON `calendar_events` (`series_key`,`recurrence_key`);--> statement-breakpoint
CREATE INDEX `calendar_events_user_start_idx` ON `calendar_events` (`user_id`,`starts_ts`);--> statement-breakpoint
CREATE INDEX `calendar_events_user_thread_idx` ON `calendar_events` (`user_id`,`thread_id`);--> statement-breakpoint
CREATE INDEX `calendar_events_subscription_idx` ON `calendar_events` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `calendar_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`host` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`last_synced_at` text,
	`event_count` integer NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_attempt_at` text,
	`last_attempt_ts` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_subscriptions_user_idx` ON `calendar_subscriptions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `calendar_subscriptions_attempt_idx` ON `calendar_subscriptions` (`last_attempt_ts`);
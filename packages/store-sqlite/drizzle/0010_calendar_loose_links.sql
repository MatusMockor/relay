PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_calendar_events` (
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
	FOREIGN KEY (`subscription_id`) REFERENCES `calendar_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_calendar_events`("id", "user_id", "account_id", "subscription_id", "series_key", "uid", "recurrence_key", "recurrence_id", "sequence", "dtstamp", "method", "status", "summary", "location", "description", "organizer", "attendees", "my_partstat", "my_email", "all_day", "starts_at", "starts_ts", "ends_at", "recurring", "range_ends_at", "range_ends_ts", "ics", "message_id", "thread_id", "created_at", "updated_at") SELECT "id", "user_id", "account_id", "subscription_id", "series_key", "uid", "recurrence_key", "recurrence_id", "sequence", "dtstamp", "method", "status", "summary", "location", "description", "organizer", "attendees", "my_partstat", "my_email", "all_day", "starts_at", "starts_ts", "ends_at", "recurring", "range_ends_at", "range_ends_ts", "ics", "message_id", "thread_id", "created_at", "updated_at" FROM `calendar_events`;--> statement-breakpoint
DROP TABLE `calendar_events`;--> statement-breakpoint
ALTER TABLE `__new_calendar_events` RENAME TO `calendar_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_series_recurrence_unique` ON `calendar_events` (`series_key`,`recurrence_key`);--> statement-breakpoint
CREATE INDEX `calendar_events_user_start_idx` ON `calendar_events` (`user_id`,`starts_ts`);--> statement-breakpoint
CREATE INDEX `calendar_events_user_thread_idx` ON `calendar_events` (`user_id`,`thread_id`);--> statement-breakpoint
CREATE INDEX `calendar_events_subscription_idx` ON `calendar_events` (`subscription_id`);
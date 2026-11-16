CREATE TABLE `google_calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`account_id` text,
	`status` text NOT NULL,
	`last_error` text,
	`last_synced_at` text,
	`last_attempt_at` text,
	`last_attempt_ts` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_connections_user_email_unique` ON `google_calendar_connections` (`user_id`,`email`);--> statement-breakpoint
CREATE INDEX `google_calendar_connections_attempt_idx` ON `google_calendar_connections` (`last_attempt_ts`);--> statement-breakpoint
CREATE TABLE `google_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`enabled` integer NOT NULL,
	`is_primary` integer NOT NULL,
	`access_role` text NOT NULL,
	`time_zone` text,
	`status` text NOT NULL,
	`last_error` text,
	`last_synced_at` text,
	`sync_token` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `google_calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendars_connection_remote_unique` ON `google_calendars` (`connection_id`,`remote_id`);--> statement-breakpoint
CREATE INDEX `google_calendars_user_idx` ON `google_calendars` (`user_id`);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `google_calendar_id` text REFERENCES google_calendars(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `remote_id` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `remote_etag` text;--> statement-breakpoint
CREATE INDEX `calendar_events_google_remote_idx` ON `calendar_events` (`google_calendar_id`,`remote_id`);
CREATE TABLE `task_system_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`site_url` text NOT NULL,
	`account_name` text NOT NULL,
	`external_account_id` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_system_connections_account_unique` ON `task_system_connections` (`user_id`,`provider`,`site_url`,`external_account_id`);
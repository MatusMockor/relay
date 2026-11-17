CREATE TABLE `automation_runs` (
	`automation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`automation_id`, `message_id`),
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	`position` integer NOT NULL,
	`preset` text,
	`conditions` text NOT NULL,
	`ai` text NOT NULL,
	`actions` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automations_user_position_idx` ON `automations` (`user_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `automations_user_preset_idx` ON `automations` (`user_id`,`preset`) WHERE preset is not null;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `effort` text;
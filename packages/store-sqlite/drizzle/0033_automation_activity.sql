CREATE TABLE `automation_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`automation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`source` text NOT NULL,
	`sender` text,
	`subject` text NOT NULL,
	`actions` text NOT NULL,
	`failed_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_ts` integer NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_activity_user_automation_created_idx` ON `automation_activity` (`user_id`,`automation_id`,`created_ts`);
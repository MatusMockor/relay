CREATE TABLE `history_backfill` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`uid_validity` integer NOT NULL,
	`below_uid` integer NOT NULL,
	`done_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `history_backfill_account_idx` ON `history_backfill` (`account_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD `body_state` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX `messages_account_reply_idx` ON `messages` (`account_id`,`in_reply_to`);--> statement-breakpoint
CREATE INDEX `messages_account_body_date_idx` ON `messages` (`account_id`,`body_state`,`date_ts`);
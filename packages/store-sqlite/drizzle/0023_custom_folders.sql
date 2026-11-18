ALTER TABLE `labels` ADD `kind` text DEFAULT 'keyword' NOT NULL;--> statement-breakpoint
ALTER TABLE `labels` ADD `remote_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `labels` SET `remote_name` = `name`;--> statement-breakpoint
CREATE UNIQUE INDEX `labels_account_kind_remote_unique` ON `labels` (`account_id`,`kind`,`remote_name`);--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `subscribed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `uid_validity` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `email_id` text;--> statement-breakpoint
CREATE INDEX `messages_account_email_idx` ON `messages` (`account_id`,`email_id`);--> statement-breakpoint
ALTER TABLE `sync_state` ADD `uid_next` integer;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `message_count` integer;
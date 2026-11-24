CREATE TABLE `message_aliases` (
	`alias_id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_placements` (
	`message_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`uid` integer NOT NULL,
	PRIMARY KEY(`message_id`, `mailbox_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_placements_mailbox_uid_unique` ON `message_placements` (`mailbox_id`,`uid`) WHERE uid > 0;--> statement-breakpoint
CREATE INDEX `message_placements_mailbox_uid_idx` ON `message_placements` (`mailbox_id`,`uid`,`message_id`);--> statement-breakpoint
INSERT INTO `message_placements` (`message_id`, `mailbox_id`, `uid`)
SELECT `id`, `mailbox_id`, `uid` FROM `messages`;

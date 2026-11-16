ALTER TABLE `accounts` ADD `sender_name` text;--> statement-breakpoint
UPDATE `accounts` SET `sender_name` = `display_name`;

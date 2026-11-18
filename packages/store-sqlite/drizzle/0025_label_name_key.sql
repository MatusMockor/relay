DROP INDEX `labels_account_name_unique`;--> statement-breakpoint
ALTER TABLE `labels` ADD `name_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `labels` SET `name_key` = lower(`name`);--> statement-breakpoint
UPDATE `labels` SET `name_key` = `name_key` || '#' || `id` WHERE EXISTS (SELECT 1 FROM `labels` AS `other` WHERE `other`.`account_id` = `labels`.`account_id` AND `other`.`name_key` = `labels`.`name_key` AND `other`.`id` < `labels`.`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `labels_account_name_key_unique` ON `labels` (`account_id`,`name_key`);
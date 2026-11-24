ALTER TABLE `messages` ADD `jira_effects_at` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `invite_effects_at` text;--> statement-breakpoint
DROP INDEX `messages_mailbox_uid_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_mailbox_uid_unique` ON `messages` (`mailbox_id`,`uid`) WHERE uid > 0;--> statement-breakpoint
UPDATE `messages` SET
  `jira_effects_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  `invite_effects_at` = CASE WHEN EXISTS (
    SELECT 1 FROM `message_placements` mp
    INNER JOIN `mailboxes` mb ON mb.`id` = mp.`mailbox_id`
    WHERE mp.`message_id` = `messages`.`id` AND mb.`role` NOT IN ('drafts', 'spam', 'custom')
  ) THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
WHERE EXISTS (
  SELECT 1 FROM `message_placements` mp
  INNER JOIN `mailboxes` mb ON mb.`id` = mp.`mailbox_id`
  WHERE mp.`message_id` = `messages`.`id` AND mb.`role` NOT IN ('spam', 'custom')
);

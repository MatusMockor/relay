DELETE FROM `pending_work` WHERE `kind` = 'calendar-reply';--> statement-breakpoint
INSERT INTO `pending_work` (`account_id`, `kind`, `ref`, `payload`, `revision`, `created_at`)
SELECT
  `account_id`,
  'calendar-rebuild',
  `id`,
  json_object('mailboxId', `id`, 'afterUid', 0),
  lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `mailboxes`
WHERE `role` NOT IN ('drafts', 'spam')
ON CONFLICT DO NOTHING;

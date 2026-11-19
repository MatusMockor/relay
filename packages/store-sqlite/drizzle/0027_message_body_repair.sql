INSERT INTO `pending_work` (`account_id`, `kind`, `ref`, `payload`, `revision`, `created_at`)
SELECT
  `account_id`,
  'body-repair',
  `id`,
  json_object('mailboxId', `id`, 'afterUid', 0),
  lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `mailboxes`
WHERE EXISTS (
  SELECT 1 FROM `messages`
  WHERE `messages`.`mailbox_id` = `mailboxes`.`id`
    AND (
      instr(`messages`.`text_body`, char(65533)) > 0
      OR instr(`messages`.`html_body`, char(65533)) > 0
      OR instr(`messages`.`snippet`, char(65533)) > 0
    )
)
ON CONFLICT DO NOTHING;

CREATE INDEX `message_aliases_message_idx` ON `message_aliases` (`message_id`);--> statement-breakpoint
INSERT INTO `pending_work` (`account_id`, `kind`, `ref`, `payload`, `revision`, `created_at`)
SELECT `id`, 'copy-merge', 'account', json_object(), lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `accounts` WHERE true
ON CONFLICT (`account_id`, `kind`, `ref`) DO NOTHING;

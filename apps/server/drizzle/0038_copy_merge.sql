CREATE INDEX "automation_runs_message_idx" ON "automation_runs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "drafts_reply_message_idx" ON "drafts" USING btree ("in_reply_to_message_id");--> statement-breakpoint
CREATE INDEX "message_aliases_message_idx" ON "message_aliases" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_account_email_bytes_idx" ON "messages" USING btree ("account_id","email_id" collate "C") WHERE email_id is not null;--> statement-breakpoint
INSERT INTO "pending_work" ("account_id", "kind", "ref", "payload", "revision", "created_at")
SELECT "id", 'copy-merge', 'account', '{}'::jsonb, gen_random_uuid()::text, now()
FROM "mail_accounts"
ON CONFLICT DO NOTHING;

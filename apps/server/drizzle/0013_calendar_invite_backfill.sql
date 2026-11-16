INSERT INTO "pending_work" ("account_id", "kind", "ref", "payload", "revision", "created_at")
SELECT
  "account_id",
  'calendar-backfill',
  "id",
  jsonb_build_object('mailboxId', "id", 'afterUid', 0),
  gen_random_uuid()::text,
  now()
FROM "mailboxes"
WHERE "role" NOT IN ('drafts', 'spam')
ON CONFLICT DO NOTHING;

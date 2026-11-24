ALTER TABLE "messages" ADD COLUMN "jira_effects_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "invite_effects_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
UPDATE "messages" SET
  "jira_effects_at" = CASE WHEN EXISTS (
    SELECT 1 FROM "message_placements" mp
    INNER JOIN "mailboxes" mb ON mb."id" = mp."mailbox_id"
    WHERE mp."message_id" = "messages"."id" AND mb."role" NOT IN ('spam', 'custom')
  ) THEN "messages"."jira_effects_at" END,
  "invite_effects_at" = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "message_placements" mp
  INNER JOIN "mailboxes" mb ON mb."id" = mp."mailbox_id"
  WHERE mp."message_id" = "messages"."id" AND mb."role" NOT IN ('drafts', 'spam', 'custom')
);--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "jira_effects_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "invite_effects_at" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "messages_mailbox_uid_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "messages_mailbox_uid_unique" ON "messages" USING btree ("mailbox_id","uid") WHERE uid > 0;

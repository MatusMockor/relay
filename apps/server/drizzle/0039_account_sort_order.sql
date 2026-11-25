ALTER TABLE "mail_accounts" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "mail_accounts" SET "sort_order" = "ranked"."position"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") - 1 AS "position"
  FROM "mail_accounts"
) AS "ranked"
WHERE "mail_accounts"."id" = "ranked"."id";

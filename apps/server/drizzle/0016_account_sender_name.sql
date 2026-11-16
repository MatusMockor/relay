ALTER TABLE "mail_accounts" ADD COLUMN "sender_name" text;--> statement-breakpoint
UPDATE "mail_accounts" SET "sender_name" = "display_name";

ALTER TABLE "labels" ADD COLUMN "kind" text DEFAULT 'keyword' NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "remote_name" text;--> statement-breakpoint
UPDATE "labels" SET "remote_name" = "name";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "remote_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "subscribed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "uid_validity" bigint;--> statement-breakpoint
ALTER TABLE "sync_state" ADD COLUMN "uid_next" bigint;--> statement-breakpoint
ALTER TABLE "sync_state" ADD COLUMN "message_count" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "email_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_account_kind_remote_unique" ON "labels" USING btree ("account_id","kind","remote_name");--> statement-breakpoint
CREATE INDEX "messages_account_email_idx" ON "messages" USING btree ("account_id","email_id");
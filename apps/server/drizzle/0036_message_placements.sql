CREATE TABLE "message_aliases" (
	"alias_id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_placements" (
	"message_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"uid" bigint NOT NULL,
	CONSTRAINT "message_placements_message_id_mailbox_id_pk" PRIMARY KEY("message_id","mailbox_id")
);
--> statement-breakpoint
ALTER TABLE "message_aliases" ADD CONSTRAINT "message_aliases_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_placements" ADD CONSTRAINT "message_placements_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_placements" ADD CONSTRAINT "message_placements_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_placements_mailbox_uid_unique" ON "message_placements" USING btree ("mailbox_id","uid") WHERE uid > 0;--> statement-breakpoint
CREATE INDEX "message_placements_mailbox_uid_idx" ON "message_placements" USING btree ("mailbox_id","uid","message_id");--> statement-breakpoint
INSERT INTO "message_placements" ("message_id", "mailbox_id", "uid")
SELECT "id", "mailbox_id", "uid" FROM "messages";

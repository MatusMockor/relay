CREATE TABLE "automation_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"automation_id" text NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"source" text NOT NULL,
	"sender" jsonb,
	"subject" text NOT NULL,
	"actions" jsonb NOT NULL,
	"failed_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "automation_activity" ADD CONSTRAINT "automation_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_activity" ADD CONSTRAINT "automation_activity_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_activity" ADD CONSTRAINT "automation_activity_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_activity_user_automation_created_idx" ON "automation_activity" USING btree ("user_id","automation_id","created_at");
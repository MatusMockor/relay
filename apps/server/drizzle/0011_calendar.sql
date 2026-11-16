CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"subscription_id" text,
	"series_key" text NOT NULL,
	"uid" text NOT NULL,
	"recurrence_key" text NOT NULL,
	"recurrence_id" text,
	"sequence" integer NOT NULL,
	"dtstamp" timestamp with time zone,
	"method" text,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"location" text,
	"description" text,
	"organizer" jsonb,
	"attendees" jsonb NOT NULL,
	"my_partstat" text,
	"my_email" text,
	"all_day" boolean NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"recurring" boolean NOT NULL,
	"range_ends_at" timestamp with time zone,
	"ics" text NOT NULL,
	"message_id" text,
	"thread_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_events_one_source" CHECK (("calendar_events"."account_id" is null) <> ("calendar_events"."subscription_id" is null))
);
--> statement-breakpoint
CREATE TABLE "calendar_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"host" text NOT NULL,
	"url_envelope" text,
	"status" text NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"event_count" integer NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_subscription_id_calendar_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."calendar_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_series_recurrence_unique" ON "calendar_events" USING btree ("series_key","recurrence_key");--> statement-breakpoint
CREATE INDEX "calendar_events_user_start_idx" ON "calendar_events" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_user_thread_idx" ON "calendar_events" USING btree ("user_id","thread_id");--> statement-breakpoint
CREATE INDEX "calendar_events_subscription_idx" ON "calendar_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "calendar_subscriptions_user_idx" ON "calendar_subscriptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "calendar_subscriptions_attempt_idx" ON "calendar_subscriptions" USING btree ("last_attempt_at");
CREATE TABLE "google_calendar_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"account_id" text,
	"credentials_envelope" text,
	"status" text NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"enabled" boolean NOT NULL,
	"is_primary" boolean NOT NULL,
	"access_role" text NOT NULL,
	"time_zone" text,
	"status" text NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"sync_token" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_one_source";--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_calendar_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "remote_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "remote_etag" text;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_connections_user_email_unique" ON "google_calendar_connections" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_attempt_idx" ON "google_calendar_connections" USING btree ("last_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendars_connection_remote_unique" ON "google_calendars" USING btree ("connection_id","remote_id");--> statement-breakpoint
CREATE INDEX "google_calendars_user_idx" ON "google_calendars" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_google_calendar_id_google_calendars_id_fk" FOREIGN KEY ("google_calendar_id") REFERENCES "public"."google_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_google_remote_idx" ON "calendar_events" USING btree ("google_calendar_id","remote_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_one_source" CHECK (num_nonnulls("calendar_events"."account_id", "calendar_events"."subscription_id", "calendar_events"."google_calendar_id") = 1);
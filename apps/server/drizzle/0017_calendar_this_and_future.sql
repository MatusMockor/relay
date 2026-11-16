ALTER TABLE "calendar_events" ADD COLUMN "this_and_future" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "ends_series" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "range_sequence" integer;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "range_dtstamp" timestamp with time zone;
ALTER TABLE "automations" ADD COLUMN "match" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL;
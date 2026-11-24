ALTER TABLE "splits" ADD COLUMN "match" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "splits" ADD COLUMN "exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL;
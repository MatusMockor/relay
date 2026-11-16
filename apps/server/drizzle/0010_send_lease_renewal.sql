ALTER TABLE "drafts" ADD COLUMN "send_renewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD COLUMN "renewed_at" timestamp with time zone;
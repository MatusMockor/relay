ALTER TABLE "sync_state" ADD COLUMN "initial_floor_uid" bigint;--> statement-breakpoint
ALTER TABLE "sync_state" ADD COLUMN "initial_cutoff" timestamp with time zone;
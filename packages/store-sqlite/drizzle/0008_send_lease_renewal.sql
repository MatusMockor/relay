ALTER TABLE `drafts` ADD `send_renewed_ts` integer;--> statement-breakpoint
ALTER TABLE `scheduled_sends` ADD `renewed_ts` integer;
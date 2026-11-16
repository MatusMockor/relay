ALTER TABLE `calendar_events` ADD `this_and_future` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `ends_series` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `range_sequence` integer;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `range_dtstamp` text;
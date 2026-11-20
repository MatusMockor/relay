ALTER TABLE `automations` ADD `match` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `automations` ADD `exceptions` text DEFAULT '[]' NOT NULL;
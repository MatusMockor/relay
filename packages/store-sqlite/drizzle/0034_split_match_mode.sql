ALTER TABLE `splits` ADD `match` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE `splits` ADD `exceptions` text DEFAULT '[]' NOT NULL;
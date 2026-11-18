CREATE TABLE `removed_automation_presets` (
	`user_id` text NOT NULL,
	`preset` text NOT NULL,
	PRIMARY KEY(`user_id`, `preset`)
);

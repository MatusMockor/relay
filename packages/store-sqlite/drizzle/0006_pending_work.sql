CREATE TABLE `pending_work` (
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`payload` text NOT NULL,
	`revision` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `ref`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_work_order_idx` ON `pending_work` (`account_id`,`kind`,`created_at`);
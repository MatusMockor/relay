CREATE INDEX `messages_mailbox_thread_idx` ON `messages` (`mailbox_id`,`thread_id`);--> statement-breakpoint
CREATE INDEX `threads_user_order_idx` ON `threads` (`user_id`,`last_message_ts`,`id`);--> statement-breakpoint
CREATE INDEX `threads_account_order_idx` ON `threads` (`account_id`,`last_message_ts`,`id`);
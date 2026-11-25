ALTER TABLE `accounts` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `accounts` SET `sort_order` = (
  SELECT count(*) FROM `accounts` AS `earlier`
  WHERE `earlier`.`user_id` = `accounts`.`user_id`
    AND (
      `earlier`.`created_at` < `accounts`.`created_at`
      OR (`earlier`.`created_at` = `accounts`.`created_at` AND `earlier`.`id` < `accounts`.`id`)
    )
);

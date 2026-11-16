UPDATE `calendar_events` SET
  `status` = CASE WHEN upper(`ics`) LIKE '%' || char(10) || 'STATUS:TENTATIVE%' THEN 'tentative' ELSE 'confirmed' END,
  `method` = 'REQUEST',
  `sequence` = CASE WHEN instr(upper(`ics`), char(10) || 'SEQUENCE:') = 0 THEN 0 ELSE CAST(rtrim(substr(substr(`ics`, instr(upper(`ics`), char(10) || 'SEQUENCE:') + 10), 1, instr(substr(`ics`, instr(upper(`ics`), char(10) || 'SEQUENCE:') + 10) || char(10), char(10)) - 1), char(13)) AS INTEGER) END,
  `dtstamp` = CASE WHEN instr(upper(`ics`), char(10) || 'DTSTAMP:') > 0 AND upper(substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 9, 16)) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z' THEN
    substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 9, 4) || '-' || substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 13, 2) || '-' || substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 15, 2) || 'T' || substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 18, 2) || ':' || substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 20, 2) || ':' || substr(`ics`, instr(upper(`ics`), char(10) || 'DTSTAMP:') + 22, 2) || '.000Z'
    ELSE NULL END,
  `revision` = `revision` + 1
WHERE `recurrence_key` = '' AND `account_id` IS NOT NULL AND `status` = 'cancelled' AND `method` = 'CANCEL' AND `message_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `calendar_events` AS `cut` WHERE `cut`.`series_key` = `calendar_events`.`series_key` AND `cut`.`this_and_future` = 1 AND `cut`.`ends_series` = 1 AND `cut`.`message_id` = `calendar_events`.`message_id` AND `cut`.`recurrence_id` <= `calendar_events`.`starts_at`);

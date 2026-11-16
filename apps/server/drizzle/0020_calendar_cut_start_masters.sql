UPDATE "calendar_events" SET
  "status" = CASE WHEN upper("ics") LIKE '%' || chr(10) || 'STATUS:TENTATIVE%' THEN 'tentative' ELSE 'confirmed' END,
  "method" = 'REQUEST',
  "sequence" = coalesce(substring(upper("ics") from '\nSEQUENCE:([0-9]+)')::integer, 0),
  "dtstamp" = to_timestamp(substring(upper("ics") from '\nDTSTAMP:([0-9]{8}T[0-9]{6})Z'), 'YYYYMMDD"T"HH24MISS')::timestamp AT TIME ZONE 'UTC',
  "revision" = "revision" + 1
WHERE "recurrence_key" = '' AND "account_id" IS NOT NULL AND "status" = 'cancelled' AND "method" = 'CANCEL' AND "message_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "calendar_events" AS "cut" WHERE "cut"."series_key" = "calendar_events"."series_key" AND "cut"."this_and_future" AND "cut"."ends_series" AND "cut"."message_id" = "calendar_events"."message_id" AND "cut"."recurrence_id" <= to_char("calendar_events"."starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

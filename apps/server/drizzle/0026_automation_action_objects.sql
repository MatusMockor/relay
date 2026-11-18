UPDATE "automations" SET "actions" = (
  SELECT jsonb_agg(jsonb_build_object('type', "action"."value") ORDER BY "action"."position")
  FROM jsonb_array_elements_text("automations"."actions") WITH ORDINALITY AS "action"("value", "position")
) WHERE jsonb_typeof("actions"->0) = 'string';

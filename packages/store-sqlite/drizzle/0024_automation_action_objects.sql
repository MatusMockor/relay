UPDATE `automations` SET `actions` = (
  SELECT json_group_array(json_object('type', `ordered`.`value`))
  FROM (SELECT `value` FROM json_each(`automations`.`actions`) ORDER BY `key`) AS `ordered`
) WHERE json_type(`actions`, '$[0]') = 'text';

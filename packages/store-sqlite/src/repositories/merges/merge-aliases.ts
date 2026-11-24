import { sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { LOSER_IDS } from './merge-temp-tables';

export const aliasLosers = (db: RelayDb): void => {
  db.run(sql`
    update message_aliases set message_id = map.keeper_id
    from temp.merge_map map
    where message_aliases.message_id in ${LOSER_IDS}
      and message_aliases.message_id = map.loser_id
  `);
  db.run(sql`
    insert into message_aliases (alias_id, message_id)
    select loser_id, keeper_id from temp.merge_map where true
    on conflict (alias_id) do update set message_id = excluded.message_id
  `);
};

export const deleteLosers = (db: RelayDb): void => {
  db.run(sql`delete from messages where id in ${LOSER_IDS}`);
};

import { sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { LOSER_IDS } from './merge-temp-tables';

export const mergePlacements = (db: RelayDb): void => {
  db.run(sql`
    delete from message_placements
    where (message_id, mailbox_id) in (select message_id, mailbox_id from temp.merge_drop)
  `);
  db.run(sql`
    update message_placements set message_id = map.keeper_id
    from temp.merge_map map
    where message_placements.message_id in ${LOSER_IDS}
      and message_placements.message_id = map.loser_id
  `);
};

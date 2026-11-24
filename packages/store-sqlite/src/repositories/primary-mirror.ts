import { PLACEMENT_ROLE_ORDER } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { chunked } from './chunked';

const ROLE_RANK = sql.join(
  PLACEMENT_ROLE_ORDER.map((role, index) => sql`when ${role} then ${index}`),
  sql` `,
);

const RANK = sql`case mb.role ${ROLE_RANK} else ${PLACEMENT_ROLE_ORDER.length} end`;

const refreshChunk = (db: RelayDb, messageIds: readonly string[]): void => {
  db.run(sql`
    update messages set mailbox_id = ranked.mailbox_id, uid = ranked.uid
    from (
      select message_id, mailbox_id, uid from (
        select mp.message_id, mp.mailbox_id, mp.uid, row_number() over (
          partition by mp.message_id order by mp.uid = 0, ${RANK}, mp.mailbox_id
        ) as position
        from message_placements mp
        inner join mailboxes mb on mb.id = mp.mailbox_id
        where mp.message_id in ${[...messageIds]}
      ) where position = 1
    ) as ranked
    where messages.id = ranked.message_id
      and (messages.mailbox_id <> ranked.mailbox_id or messages.uid <> ranked.uid)
  `);
};

export const refreshPrimaryMirror = (db: RelayDb, messageIds: readonly string[]): void => {
  chunked([...new Set(messageIds)]).forEach((chunk) => {
    refreshChunk(db, chunk);
  });
};

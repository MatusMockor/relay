import { PLACEMENT_ROLE_ORDER } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';

const ROLE_RANK = sql.join(
  PLACEMENT_ROLE_ORDER.map((role, index) => sql`when ${role} then ${index}`),
  sql` `,
);

const RANK = sql`case mb.role ${ROLE_RANK} else ${PLACEMENT_ROLE_ORDER.length} end`;

export const refreshPrimaryMirror = async (
  db: DbExecutor,
  messageIds: readonly string[],
): Promise<void> => {
  if (messageIds.length === 0) {
    return;
  }
  const ids = sql.param([...new Set(messageIds)]);
  await db.execute(sql`
    update messages m set mailbox_id = ranked.mailbox_id, uid = ranked.uid
    from (
      select distinct on (mp.message_id) mp.message_id, mp.mailbox_id, mp.uid
      from message_placements mp
      inner join mailboxes mb on mb.id = mp.mailbox_id
      where mp.message_id = any(${ids}::text[])
      order by mp.message_id, mp.uid = 0, ${RANK}, mp.mailbox_id collate "C"
    ) as ranked
    where m.id = any(${ids}::text[]) and m.id = ranked.message_id
      and (m.mailbox_id, m.uid) is distinct from (ranked.mailbox_id, ranked.uid)
  `);
};

import type { GroupMergePlan } from '@relay/engine';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { MERGE_MAP, type MergeIds } from './merge-tables';

export const reduceMergedPlacements = async (
  db: DbExecutor,
  plans: readonly GroupMergePlan[],
  ids: MergeIds,
): Promise<void> => {
  const dropped = plans.flatMap((plan) => plan.placements.dropped);
  if (dropped.length > 0) {
    await db.execute(sql`delete from message_placements mp
      using unnest(
        ${sql.param(dropped.map((owned) => owned.messageId))}::text[],
        ${sql.param(dropped.map((owned) => owned.placement.mailboxId))}::text[]
      ) as dropped(message_id, mailbox_id)
      where mp.message_id = dropped.message_id and mp.mailbox_id = dropped.mailbox_id`);
  }
  await db.execute(sql`update message_placements mp set message_id = map.keeper_id
    from ${MERGE_MAP} map where mp.message_id = any(${ids.losers}) and mp.message_id = map.loser_id`);
};

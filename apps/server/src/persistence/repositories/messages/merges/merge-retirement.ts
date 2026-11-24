import type { GroupMergePlan } from '@relay/engine';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { refreshPrimaryMirror } from '../primary-mirror';
import { MERGE_MAP, type MergeIds } from './merge-tables';

const recordAliases = async (db: DbExecutor, ids: MergeIds): Promise<void> => {
  await db.execute(sql`update message_aliases alias set message_id = map.keeper_id
    from ${MERGE_MAP} map where alias.message_id = any(${ids.losers}) and alias.message_id = map.loser_id`);
  await db.execute(sql`insert into message_aliases (alias_id, message_id)
    select loser_id, keeper_id from ${MERGE_MAP}
    on conflict (alias_id) do update set message_id = excluded.message_id`);
};

export const retireLosers = async (
  db: DbExecutor,
  plans: readonly GroupMergePlan[],
  ids: MergeIds,
): Promise<void> => {
  await recordAliases(db, ids);
  await db.execute(sql`delete from messages where id = any(${ids.losers})`);
  await refreshPrimaryMirror(
    db,
    plans.map((plan) => plan.keeper.id),
  );
};

import type { GroupMergePlan } from '@relay/engine';
import { type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';

export const MERGE_MAP = sql.raw('merge_map');
export const MERGE_KEEPER = sql.raw('merge_keeper');

const createTables = async (db: DbExecutor): Promise<void> => {
  await db.execute(sql`create temp table if not exists merge_map (
    loser_id text primary key,
    keeper_id text not null
  ) on commit drop`);
  await db.execute(sql`create temp table if not exists merge_keeper (
    keeper_id text primary key,
    donor_id text not null
  ) on commit drop`);
  await db.execute(sql`truncate ${MERGE_MAP}, ${MERGE_KEEPER}`);
};

const fillMap = async (db: DbExecutor, plans: readonly GroupMergePlan[]): Promise<void> => {
  const pairs = plans.flatMap(({ keeper, losers }) =>
    losers.map((loser) => ({ loser: loser.id, keeper: keeper.id })),
  );
  await db.execute(sql`insert into ${MERGE_MAP} (loser_id, keeper_id)
    select * from unnest(
      ${sql.param(pairs.map((pair) => pair.loser))}::text[],
      ${sql.param(pairs.map((pair) => pair.keeper))}::text[]
    )`);
};

const fillKeepers = async (db: DbExecutor, plans: readonly GroupMergePlan[]): Promise<void> => {
  await db.execute(sql`insert into ${MERGE_KEEPER} (keeper_id, donor_id)
    select * from unnest(
      ${sql.param(plans.map((plan) => plan.keeper.id))}::text[],
      ${sql.param(plans.map((plan) => plan.donor.id))}::text[]
    )`);
};

export const prepareMergeTables = async (
  db: DbExecutor,
  plans: readonly GroupMergePlan[],
): Promise<void> => {
  await createTables(db);
  await fillMap(db, plans);
  await fillKeepers(db, plans);
  await db.execute(sql`analyze ${MERGE_MAP}, ${MERGE_KEEPER}`);
};

export interface MergeIds {
  readonly keepers: SQL;
  readonly losers: SQL;
  readonly donors: SQL;
}

const idArray = (ids: readonly string[]): SQL => sql`${sql.param([...new Set(ids)])}::text[]`;

export const mergeIdsOf = (plans: readonly GroupMergePlan[]): MergeIds => ({
  keepers: idArray(plans.map((plan) => plan.keeper.id)),
  losers: idArray(plans.flatMap((plan) => plan.losers.map((loser) => loser.id))),
  donors: idArray(plans.map((plan) => plan.donor.id)),
});

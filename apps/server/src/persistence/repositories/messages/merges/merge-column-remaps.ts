import type { UserId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import {
  type ColumnMerge,
  type ColumnReference,
  MESSAGE_COLUMN_REFERENCES,
} from './message-references';
import { MERGE_MAP, type MergeIds } from './merge-tables';

interface RemapScope {
  readonly userId: UserId;
  readonly ids: MergeIds;
}

type ColumnRemap = (db: DbExecutor, reference: ColumnReference, scope: RemapScope) => Promise<void>;

const activeJob = (alias: string) => sql.raw(`${alias}.status in ('queued', 'running')`);

const handledElsewhere: ColumnRemap = () => Promise.resolve();

const updateColumn: ColumnRemap = async (db, { table, column }, { userId, ids }) => {
  const target = sql.identifier(column);
  await db.execute(sql`update ${sql.identifier(table)} as t set ${target} = map.keeper_id
    from ${MERGE_MAP} map where t.user_id = ${userId} and t.${target} = any(${ids.losers})
      and t.${target} = map.loser_id`);
};

const copyAutomationRuns: ColumnRemap = async (db, _reference, { userId, ids }) => {
  await db.execute(sql`insert into automation_runs (automation_id, message_id, user_id, created_at)
    select run.automation_id, map.keeper_id, run.user_id, run.created_at
    from automation_runs run inner join ${MERGE_MAP} map on map.loser_id = run.message_id
    where run.user_id = ${userId} and run.message_id = any(${ids.losers})
    on conflict do nothing`);
};

const remapAiJobSources: ColumnRemap = async (db, _reference, { userId, ids }) => {
  await db.execute(sql`with candidates as (
      select job.id, job.user_id, job.thread_id, job.kind, job.created_at, map.keeper_id,
        ${activeJob('job')} as active
      from ai_jobs job inner join ${MERGE_MAP} map on map.loser_id = job.source_message_id
      where job.user_id = ${userId} and job.source_message_id = any(${ids.losers})
    ),
    ranked as (
      select candidates.*, row_number() over (
        partition by user_id, thread_id, kind, keeper_id order by created_at, id collate "C"
      ) as rank
      from candidates where active
    ),
    movable as (
      select id, keeper_id from candidates where not active
      union all
      select ranked.id, ranked.keeper_id from ranked
      where ranked.rank = 1 and not exists (
        select 1 from ai_jobs kept
        where kept.source_message_id = ranked.keeper_id and kept.user_id = ranked.user_id
          and kept.thread_id is not distinct from ranked.thread_id and kept.kind = ranked.kind
          and ${activeJob('kept')}
      )
    )
    update ai_jobs job set source_message_id = movable.keeper_id
    from movable where job.id = movable.id`);
};

const STRATEGIES: Readonly<Record<ColumnMerge, ColumnRemap>> = {
  placements: handledElsewhere,
  'keeper-labels': handledElsewhere,
  aliases: handledElsewhere,
  'insert-or-ignore': copyAutomationRuns,
  update: updateColumn,
  'update-unless-colliding': remapAiJobSources,
};

export const remapColumnReferences = async (db: DbExecutor, scope: RemapScope): Promise<void> => {
  for (const reference of MESSAGE_COLUMN_REFERENCES) {
    await STRATEGIES[reference.merge](db, reference, scope);
  }
};

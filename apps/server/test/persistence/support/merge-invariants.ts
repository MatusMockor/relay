import { MESSAGE_PENDING_KINDS } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import type { DbExecutor } from '../../../src/persistence/database/database';
import {
  MESSAGE_COLUMN_REFERENCES,
  MESSAGE_JSON_REFERENCES,
} from '../../../src/persistence/repositories/messages/merges/message-references';

export interface ReferencedId extends Record<string, unknown> {
  readonly source: string;
  readonly id: string;
}

const PENDING_KINDS = sql.param([...MESSAGE_PENDING_KINDS]);

const columnSources = (): SQL[] =>
  MESSAGE_COLUMN_REFERENCES.filter(({ column }) => column !== 'alias_id').map(
    ({ table, column }) =>
      sql`select ${`${table}.${column}`}::text as source, ${sql.identifier(column)}::text as id
        from ${sql.identifier(table)} where ${sql.identifier(column)} is not null`,
  );

const jsonSources = (): SQL[] =>
  MESSAGE_JSON_REFERENCES.flatMap(({ table, column, paths }) =>
    paths.map(
      (path) =>
        sql`select ${`${table}.${column} ${path}`}::text as source, found #>> '{}' as id
          from ${sql.identifier(table)} t,
            lateral jsonb_path_query(t.${sql.identifier(column)}, ${path}::jsonpath) found`,
    ),
  );

const pendingSources = (): SQL[] => [
  sql`select 'pending_work.payload'::text as source, payload->>'messageId' as id from pending_work
    where kind = any(${PENDING_KINDS}::text[]) and payload ? 'messageId'`,
  sql`select 'pending_work.ref'::text as source,
      case when kind = 'provider-op' then split_part(ref, ':', 1) else ref end as id
    from pending_work where kind = any(${PENDING_KINDS}::text[]) and kind <> 'calendar-reply'`,
];

export const referencedIds = async (db: DbExecutor): Promise<ReferencedId[]> => {
  const union = sql.join(
    [...columnSources(), ...jsonSources(), ...pendingSources()],
    sql` union all `,
  );
  const result = await db.execute<ReferencedId>(
    sql`select source, id from (${union}) refs order by source, id`,
  );
  return result.rows;
};

export const referencesTo = async (
  db: DbExecutor,
  ids: readonly string[],
): Promise<ReferencedId[]> => {
  const wanted = new Set(ids);
  return (await referencedIds(db)).filter((reference) => wanted.has(reference.id));
};

export const danglingReferences = async (db: DbExecutor): Promise<ReferencedId[]> => {
  const result = await db.execute<{ id: string }>(
    sql`select id from messages union select alias_id from message_aliases`,
  );
  const known = new Set(result.rows.map((row) => row.id));
  return (await referencedIds(db)).filter((reference) => !known.has(reference.id));
};

export const expectMergeInvariants = async (
  db: DbExecutor,
  accountId: AccountId,
): Promise<void> => {
  const unplaced = await db.execute<{ id: string }>(sql`select m.id from messages m
    where m.account_id = ${accountId}
      and not exists (select 1 from message_placements mp where mp.message_id = m.id)`);
  const mirrorless = await db.execute<{ id: string }>(sql`select m.id from messages m
    where m.account_id = ${accountId} and not exists (
      select 1 from message_placements mp
      where mp.message_id = m.id and mp.mailbox_id = m.mailbox_id and mp.uid = m.uid
    )`);
  expect(unplaced.rows).toEqual([]);
  expect(mirrorless.rows).toEqual([]);
  await expect(danglingReferences(db)).resolves.toEqual([]);
};

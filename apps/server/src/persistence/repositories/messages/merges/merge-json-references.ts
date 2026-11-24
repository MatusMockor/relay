import { type MergeMapping, messageIdRemapOf } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { JSON_REWRITES } from './json-rewrites';
import {
  type JsonReference,
  MESSAGE_COLUMN_REFERENCES,
  MESSAGE_JSON_REFERENCES,
} from './message-references';
import { MERGE_MAP } from './merge-tables';

interface JsonRow extends Record<string, unknown> {
  readonly id: string;
  readonly value: unknown;
}

const keptOnLoser = (table: string): SQL => {
  const colliding = MESSAGE_COLUMN_REFERENCES.find(
    (reference) => reference.table === table && reference.merge === 'update-unless-colliding',
  );
  if (colliding === undefined) {
    return sql`true`;
  }
  return sql`not exists (
    select 1 from ${MERGE_MAP} map where map.loser_id = t.${sql.identifier(colliding.column)}
  )`;
};

const referencingRows = async (
  db: DbExecutor,
  reference: JsonReference,
  userId: UserId,
): Promise<JsonRow[]> => {
  const column = sql.identifier(reference.column);
  const result = await db.execute<JsonRow>(sql`select t.id, t.${column} as value
    from ${sql.identifier(reference.table)} t
    where t.user_id = ${userId} and ${keptOnLoser(reference.table)} and exists (
      select 1 from unnest(${sql.param([...reference.paths])}::text[]) as path,
        lateral jsonb_path_query(t.${column}, path::jsonpath) as found
      where found #>> '{}' in (select loser_id from ${MERGE_MAP})
    )`);
  return result.rows;
};

const writeRows = async (
  db: DbExecutor,
  reference: JsonReference,
  rows: readonly { readonly id: string; readonly value: string }[],
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }
  const column = sql.identifier(reference.column);
  await db.execute(sql`update ${sql.identifier(reference.table)} as t
    set ${column} = rewritten.value::jsonb
    from unnest(
      ${sql.param(rows.map((row) => row.id))}::text[],
      ${sql.param(rows.map((row) => row.value))}::text[]
    ) as rewritten(id, value)
    where t.id = rewritten.id`);
};

export const remapJsonReferences = async (
  db: DbExecutor,
  userId: UserId,
  mapping: MergeMapping,
): Promise<void> => {
  const remap = messageIdRemapOf(mapping.keeperOf);
  for (const reference of MESSAGE_JSON_REFERENCES) {
    const rewrite = JSON_REWRITES[reference.rewrite];
    const rows = await referencingRows(db, reference, userId);
    const rewritten = rows.flatMap((row) => {
      const value = rewrite(row.value, remap);
      return value === null ? [] : [{ id: row.id, value: JSON.stringify(value) }];
    });
    await writeRows(db, reference, rewritten);
  }
};

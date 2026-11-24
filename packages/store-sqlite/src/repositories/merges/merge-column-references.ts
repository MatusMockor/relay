import { type SQL, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { LOSER_IDS } from './merge-temp-tables';
import {
  type ColumnMerge,
  type ColumnReference,
  MESSAGE_COLUMN_REFERENCES,
} from './message-references';

type ColumnStrategy = (db: RelayDb, reference: ColumnReference) => void;

const repoint = (db: RelayDb, { table, column }: ColumnReference, conflict: SQL): void => {
  db.run(sql`
    update ${conflict} ${sql.identifier(table)} set ${sql.identifier(column)} = map.keeper_id
    from temp.merge_map map
    where ${sql.identifier(table)}.${sql.identifier(column)} = map.loser_id
  `);
};

const dropRemaining = (db: RelayDb, { table, column }: ColumnReference): void => {
  db.run(sql`delete from ${sql.identifier(table)} where ${sql.identifier(column)} in ${LOSER_IDS}`);
};

const COLUMN_STRATEGIES: Readonly<Partial<Record<ColumnMerge, ColumnStrategy>>> = {
  update: (db, reference) => {
    repoint(db, reference, sql``);
  },
  'update-unless-colliding': (db, reference) => {
    repoint(db, reference, sql`or ignore`);
  },
  'insert-or-ignore': (db, reference) => {
    repoint(db, reference, sql`or ignore`);
    dropRemaining(db, reference);
  },
};

export const remapColumnReferences = (db: RelayDb): void => {
  MESSAGE_COLUMN_REFERENCES.forEach((reference) => {
    COLUMN_STRATEGIES[reference.merge]?.(db, reference);
  });
};

export const collidingColumnsOf = (table: string): readonly string[] =>
  MESSAGE_COLUMN_REFERENCES.filter(
    (reference) => reference.table === table && reference.merge === 'update-unless-colliding',
  ).map((reference) => reference.column);

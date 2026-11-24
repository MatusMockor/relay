import { afterAll, describe, expect, it } from 'vitest';
import {
  IGNORED_MESSAGE_COLUMNS,
  MESSAGE_COLUMN_REFERENCES,
  MESSAGE_JSON_REFERENCES,
  MESSAGE_PENDING_WORK_REFERENCE,
} from '../src/repositories/merges/message-references';
import { createTestStore } from './support/test-database';

interface SchemaColumn {
  readonly tableName: string;
  readonly columnName: string;
}

const MESSAGE_ID_COLUMN = /message_id/;

const qualified = ({ table, column }: { table: string; column: string }): string =>
  `${table}.${column}`;

describe('message reference registry (SQLite)', () => {
  const store = createTestStore();
  const columns = store.database.sqlite
    .prepare<[], SchemaColumn>(
      `select m.name as tableName, p.name as columnName
       from sqlite_master m join pragma_table_info(m.name) p
       where m.type = 'table' and m.name not like 'sqlite_%'
       order by m.name, p.cid`,
    )
    .all()
    .map((row) => `${row.tableName}.${row.columnName}`);

  afterAll(() => {
    store.database.close();
  });

  it('registers every column whose name holds a message id', () => {
    const known = new Set(
      [...MESSAGE_COLUMN_REFERENCES, ...IGNORED_MESSAGE_COLUMNS].map(qualified),
    );
    const unregistered = columns.filter(
      (column) => MESSAGE_ID_COLUMN.test(column.split('.')[1] ?? '') && !known.has(column),
    );

    expect(unregistered).toEqual([]);
  });

  it('names only columns that exist in the schema', () => {
    const pending = MESSAGE_PENDING_WORK_REFERENCE;
    const registered = [
      ...MESSAGE_COLUMN_REFERENCES,
      ...MESSAGE_JSON_REFERENCES,
      ...IGNORED_MESSAGE_COLUMNS,
      { table: pending.table, column: pending.refColumn },
      { table: pending.table, column: pending.payloadColumn },
    ].map(qualified);

    expect(registered.filter((column) => !columns.includes(column))).toEqual([]);
  });
});

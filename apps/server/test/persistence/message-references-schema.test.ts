import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  IGNORED_MESSAGE_COLUMNS,
  MESSAGE_COLUMN_REFERENCES,
  MESSAGE_JSON_REFERENCES,
  MESSAGE_PENDING_WORK_REFERENCE,
} from '../../src/persistence/repositories/messages/merges/message-references';
import { usePgTestContext } from './support/pg-test-context';

interface SchemaColumn extends Record<string, unknown> {
  readonly table_name: string;
  readonly column_name: string;
}

const MESSAGE_ID_COLUMN = /message_id/;

const qualified = ({ table, column }: { table: string; column: string }): string =>
  `${table}.${column}`;

describe('message reference registry (Postgres)', () => {
  const context = usePgTestContext();

  const schemaColumns = async (): Promise<string[]> => {
    const result = await context.db.execute<SchemaColumn>(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' order by table_name, ordinal_position`,
    );
    return result.rows.map((row) => `${row.table_name}.${row.column_name}`);
  };

  it('registers every column whose name holds a message id', async () => {
    const known = new Set(
      [...MESSAGE_COLUMN_REFERENCES, ...IGNORED_MESSAGE_COLUMNS].map(qualified),
    );
    const columns = await schemaColumns();

    expect(
      columns.filter(
        (column) => MESSAGE_ID_COLUMN.test(column.split('.')[1] ?? '') && !known.has(column),
      ),
    ).toEqual([]);
  });

  it('names only columns that exist in the schema', async () => {
    const pending = MESSAGE_PENDING_WORK_REFERENCE;
    const columns = await schemaColumns();
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

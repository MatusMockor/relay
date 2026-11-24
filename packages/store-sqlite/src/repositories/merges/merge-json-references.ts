import {
  type MessageIdRemap,
  remapActivityActions,
  remapAiJobInput,
  remapAiOutput,
} from '@relay/engine';
import {
  AiJobInputSchema,
  AiOutputSchema,
  AutomationActivityActionSchema,
} from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RelayDb } from '../../database/sqlite-database';
import { collidingColumnsOf } from './merge-column-references';
import { jsonPathHoldsLoser } from './merge-json-paths';
import { LOSER_IDS } from './merge-temp-tables';
import {
  type JsonReference,
  type JsonRewrite,
  MESSAGE_JSON_REFERENCES,
} from './message-references';

type JsonRewriter = (value: unknown, remap: MessageIdRemap) => unknown;

interface JsonRow {
  readonly rowId: number;
  readonly value: string;
}

const ActivityActionsSchema = z.array(AutomationActivityActionSchema);

const rewriting =
  <Value>(schema: z.ZodType<Value>, rewrite: (value: Value, remap: MessageIdRemap) => Value) =>
  (value: unknown, remap: MessageIdRemap): unknown => {
    const parsed = schema.safeParse(value);
    return parsed.success ? rewrite(parsed.data, remap) : null;
  };

const JSON_REWRITERS: Readonly<Record<JsonRewrite, JsonRewriter>> = {
  'ai-job-input': rewriting(AiJobInputSchema, remapAiJobInput),
  'ai-output': rewriting(AiOutputSchema, remapAiOutput),
  'activity-actions': rewriting(ActivityActionsSchema, remapActivityActions),
};

const keptColliding = (table: string): SQL[] =>
  collidingColumnsOf(table).map(
    (column) =>
      sql`(${sql.identifier(column)} is null or ${sql.identifier(column)} not in ${LOSER_IDS})`,
  );

const rowsHoldingLosers = (db: RelayDb, { table, column, paths }: JsonReference): JsonRow[] => {
  const value = sql`${sql.identifier(column)}`;
  const holds = sql.join(
    paths.map((path) => jsonPathHoldsLoser(value, path)),
    sql` or `,
  );
  const conditions = [sql`(${holds})`, ...keptColliding(table)];
  return db.all<JsonRow>(sql`
    select rowid as rowId, ${value} as value from ${sql.identifier(table)}
    where ${value} is not null and ${sql.join(conditions, sql` and `)}
  `);
};

const rewriteReference = (db: RelayDb, reference: JsonReference, remap: MessageIdRemap): void => {
  const rewrite = JSON_REWRITERS[reference.rewrite];
  rowsHoldingLosers(db, reference).forEach((row) => {
    const next = rewrite(JSON.parse(row.value), remap);
    const serialized = JSON.stringify(next);
    if (next === null || serialized === row.value) {
      return;
    }
    db.run(sql`
      update ${sql.identifier(reference.table)} set ${sql.identifier(reference.column)} = ${serialized}
      where rowid = ${row.rowId}
    `);
  });
};

export const rewriteJsonReferences = (db: RelayDb, remap: MessageIdRemap): void => {
  MESSAGE_JSON_REFERENCES.forEach((reference) => {
    rewriteReference(db, reference, remap);
  });
};

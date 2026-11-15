import { normalizeSubject } from '@relay/engine';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { messages } from '../schema';
import type { SqliteDatabase } from './sqlite-database';

const BATCH_SIZE = 500;

const hasNormalizedSubject = (database: SqliteDatabase): boolean =>
  database.sqlite
    .prepare<[], { name: string }>("select name from pragma_table_info('messages')")
    .all()
    .some((column) => column.name === 'normalized_subject');

export const backfillNormalizedSubjects = (database: SqliteDatabase): number => {
  if (!hasNormalizedSubject(database)) {
    return 0;
  }
  let updated = 0;
  let lastSeq = 0;
  for (;;) {
    const rows = database.db
      .select({ seq: messages.seq, subject: messages.subject })
      .from(messages)
      .where(and(isNull(messages.normalizedSubject), gt(messages.seq, lastSeq)))
      .orderBy(asc(messages.seq))
      .limit(BATCH_SIZE)
      .all();
    if (rows.length === 0) {
      return updated;
    }
    lastSeq = rows[rows.length - 1]?.seq ?? lastSeq;
    database.sqlite.transaction(() => {
      rows.forEach((row) => {
        database.db
          .update(messages)
          .set({ normalizedSubject: normalizeSubject(row.subject).value })
          .where(eq(messages.seq, row.seq))
          .run();
      });
    })();
    updated += rows.length;
  }
};

import { and, asc, eq, gt, like } from 'drizzle-orm';
import { messages } from '../schema';
import type { SqliteDatabase } from './sqlite-database';

export type SnippetBuilder = (text: string | null, html: string | null) => string;

const BATCH_SIZE = 500;
const MARKUP_PREFIX = '<%';

interface SnippetRow {
  readonly seq: number;
  readonly snippet: string;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
}

const LATEST_THREAD_SNIPPET = `(
  select m.snippet from messages m
  where m.thread_id = threads.id
  order by m.date_ts desc, m.seq desc
  limit 1
)`;

const rebuiltSnippet = (row: SnippetRow, build: SnippetBuilder): string => {
  if (row.textBody === null && row.htmlBody === null) {
    return build(row.snippet, null);
  }
  return build(row.textBody, row.htmlBody);
};

const markupBatch = (database: SqliteDatabase, afterSeq: number): SnippetRow[] =>
  database.db
    .select({
      seq: messages.seq,
      snippet: messages.snippet,
      textBody: messages.textBody,
      htmlBody: messages.htmlBody,
    })
    .from(messages)
    .where(and(like(messages.snippet, MARKUP_PREFIX), gt(messages.seq, afterSeq)))
    .orderBy(asc(messages.seq))
    .limit(BATCH_SIZE)
    .all();

const backfillMessageSnippets = (database: SqliteDatabase, build: SnippetBuilder): number => {
  let updated = 0;
  let lastSeq = 0;
  for (;;) {
    const rows = markupBatch(database, lastSeq);
    if (rows.length === 0) {
      return updated;
    }
    lastSeq = rows[rows.length - 1]?.seq ?? lastSeq;
    const changes = rows
      .map((row) => ({ seq: row.seq, before: row.snippet, snippet: rebuiltSnippet(row, build) }))
      .filter((change) => change.snippet !== change.before);
    database.sqlite.transaction(() => {
      changes.forEach((change) => {
        database.db
          .update(messages)
          .set({ snippet: change.snippet })
          .where(eq(messages.seq, change.seq))
          .run();
      });
    })();
    updated += changes.length;
  }
};

const backfillThreadSnippets = (database: SqliteDatabase): number =>
  database.sqlite
    .prepare(
      `update threads set snippet = ${LATEST_THREAD_SNIPPET}
       where snippet like '${MARKUP_PREFIX}'
         and snippet <> coalesce(${LATEST_THREAD_SNIPPET}, snippet)`,
    )
    .run().changes;

export interface HtmlSnippetBackfill {
  readonly messages: number;
  readonly threads: number;
}

export const backfillHtmlSnippets = (
  database: SqliteDatabase,
  build: SnippetBuilder,
): HtmlSnippetBackfill => {
  const messageCount = backfillMessageSnippets(database, build);
  return { messages: messageCount, threads: backfillThreadSnippets(database) };
};

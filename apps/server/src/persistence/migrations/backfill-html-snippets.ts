import { buildSnippet } from '@relay/mail-core';
import type pg from 'pg';

const BATCH_SIZE = 500;

interface SnippetRow {
  readonly id: string;
  readonly snippet: string;
  readonly text_body: string | null;
  readonly html_body: string | null;
}

interface SnippetChange {
  readonly id: string;
  readonly before: string;
  readonly snippet: string;
}

export interface HtmlSnippetBackfill {
  readonly messages: number;
  readonly threads: number;
}

const rebuiltSnippet = (row: SnippetRow): string => {
  if (row.text_body === null && row.html_body === null) {
    return buildSnippet(row.snippet, null);
  }
  return buildSnippet(row.text_body, row.html_body);
};

const changesOf = (rows: readonly SnippetRow[]): SnippetChange[] =>
  rows
    .map((row) => ({ id: row.id, before: row.snippet, snippet: rebuiltSnippet(row) }))
    .filter((change) => change.snippet !== change.before);

const applyChanges = async (
  client: pg.Client,
  changes: readonly SnippetChange[],
): Promise<number> => {
  if (changes.length === 0) {
    return 0;
  }
  const result = await client.query(
    `UPDATE messages AS m SET snippet = v.snippet
     FROM unnest($1::text[], $2::text[], $3::text[]) AS v(id, before, snippet)
     WHERE m.id = v.id AND m.snippet = v.before`,
    [
      changes.map((change) => change.id),
      changes.map((change) => change.before),
      changes.map((change) => change.snippet),
    ],
  );
  return result.rowCount ?? 0;
};

const backfillMessageSnippets = async (client: pg.Client): Promise<number> => {
  let updated = 0;
  let lastId = '';
  for (;;) {
    const { rows } = await client.query<SnippetRow>(
      `SELECT id, snippet, text_body, html_body FROM messages
       WHERE snippet LIKE '<%' AND id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH_SIZE],
    );
    if (rows.length === 0) {
      return updated;
    }
    lastId = rows[rows.length - 1]?.id ?? lastId;
    updated += await applyChanges(client, changesOf(rows));
  }
};

const backfillThreadSnippets = async (client: pg.Client): Promise<number> => {
  const result = await client.query(
    `UPDATE threads AS t SET snippet = latest.snippet
     FROM (
       SELECT DISTINCT ON (m.thread_id) m.thread_id, m.snippet
       FROM messages m
       JOIN threads markup ON markup.id = m.thread_id AND markup.snippet LIKE '<%'
       ORDER BY m.thread_id, m.date DESC, m.id DESC
     ) AS latest
     WHERE t.id = latest.thread_id AND t.snippet LIKE '<%' AND t.snippet <> latest.snippet`,
  );
  return result.rowCount ?? 0;
};

export const backfillHtmlSnippets = async (client: pg.Client): Promise<HtmlSnippetBackfill> => {
  const messageCount = await backfillMessageSnippets(client);
  return { messages: messageCount, threads: await backfillThreadSnippets(client) };
};

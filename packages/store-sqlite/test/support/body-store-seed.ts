import type { Message } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import { toMessageRow } from '../../src/mappers/message-mapper';
import { messages } from '../../src/schema';
import { buildMessage, messageId, NO_HEADERS, threadId } from './fixtures';
import type { SeededAccount } from './seed';
import type { TestStore } from './test-database';

const BATCH = 500;
const DAY_MS = 86_400_000;

export const bodyMessage = (
  seeded: SeededAccount,
  index: number,
  daysAgo: number,
  overrides: Partial<Message> = {},
): Message =>
  buildMessage({
    id: messageId(`body-${String(index)}`),
    threadId: threadId(`thr-body-${String(index)}`),
    accountId: seeded.account.id,
    mailboxId: seeded.inbox.id,
    uid: index + 1,
    messageIdHeader: `<body-${String(index)}@klient.sk>`,
    date: new Date(Date.UTC(2026, 10, 20) - daysAgo * DAY_MS).toISOString(),
    ...overrides,
  });

export const seedBodyRows = (store: TestStore, rows: readonly Message[]): void => {
  store.database.sqlite.transaction(() => {
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows
        .slice(start, start + BATCH)
        .map((message) => toMessageRow(LOCAL_USER_ID, message, NO_HEADERS));
      store.database.db.insert(messages).values(batch).run();
    }
  })();
};

export const ftsCount = (store: TestStore, term: string): number =>
  store.database.sqlite
    .prepare<
      [string],
      { count: number }
    >('select count(*) as count from messages_fts where messages_fts match ?')
    .get(term)?.count ?? 0;

export const queryPlan = (store: TestStore, statement: string, params: unknown[]): string =>
  store.database.sqlite
    .prepare(`explain query plan ${statement}`)
    .all(...params)
    .map((row) => (row as { detail: string }).detail)
    .join('\n');

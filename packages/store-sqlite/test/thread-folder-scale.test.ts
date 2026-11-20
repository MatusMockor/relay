import type { ThreadFolderQuery } from '@relay/engine';
import type { Mailbox } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { timeIdCursor } from '../src/pagination/time-id-cursor';
import { selectFolderThreads } from '../src/repositories/threads/thread-folder-select';
import { BULK_LABEL_ID, BULK_SEARCH_TERM, bulkSeedThreads } from './support/bulk-thread-seed';
import { buildMailbox, mailboxId } from './support/fixtures';
import { folderQuery } from './support/folder-scenario';
import { seedAccount } from './support/seed';
import {
  createTempDirectory,
  createTestStore,
  tempDatabasePath,
  type TestStore,
} from './support/test-database';

const THREAD_COUNT = 200_000;
const PAGE_LIMIT = 200;
const QUERY_BUDGET_MS = 50;
const NEWEST_TS = Date.parse('2026-11-20T10:00:00.000Z');
const DEEP_POSITION = { ts: NEWEST_TS - 150_000 * 60_000, id: 'acc-1-t0150000' };

interface Scenario {
  readonly name: string;
  readonly query: () => Partial<ThreadFolderQuery>;
}

const directory = createTempDirectory();
let store: TestStore;
let folder: Mailbox;
let archive: Mailbox;
let tiny: Mailbox;

const scenarios: readonly Scenario[] = [
  { name: 'inbox', query: () => ({ view: 'inbox' }) },
  { name: 'inbox of one account', query: () => ({ view: 'inbox', accountId: folder.accountId }) },
  { name: 'done', query: () => ({ view: 'done' }) },
  { name: 'sent', query: () => ({ view: 'sent' }) },
  { name: 'archive mailbox', query: () => ({ view: 'mailbox', mailboxId: archive.id }) },
  { name: 'custom folder', query: () => ({ view: 'mailbox', mailboxId: folder.id }) },
  { name: 'tiny folder', query: () => ({ view: 'mailbox', mailboxId: tiny.id }) },
  {
    name: 'label',
    query: () => ({ view: 'label', labelId: BULK_LABEL_ID as ThreadFolderQuery['labelId'] }),
  },
  { name: 'search', query: () => ({ view: 'done', search: BULK_SEARCH_TERM }) },
];

const fullQuery = (scenario: Scenario, cursor: string | null): ThreadFolderQuery =>
  folderQuery({ limit: PAGE_LIMIT, ...scenario.query(), cursor });

const medianMs = async (query: ThreadFolderQuery): Promise<number> => {
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    await store.repositories.threads.queryFolder(LOCAL_USER_ID, query);
    samples.push(performance.now() - started);
  }
  return samples.sort((left, right) => left - right)[2] ?? Number.POSITIVE_INFINITY;
};

const planOf = (query: ThreadFolderQuery): string[] => {
  const position = timeIdCursor.decode(query.cursor);
  const statement = selectFolderThreads(
    store.database.db,
    LOCAL_USER_ID,
    query,
    position,
    query.limit + 1,
  ).toSQL();
  const rows: unknown[] = store.database.sqlite
    .prepare(`explain query plan ${statement.sql}`)
    .all(...statement.params);
  return rows.map((row) => String((row as { detail: unknown }).detail));
};

describe(`SqliteThreadRepository.queryFolder with ${String(THREAD_COUNT)} threads`, () => {
  beforeAll(async () => {
    store = createTestStore(tempDatabasePath(directory));
    const work = await seedAccount(store.repositories);
    const stored = await store.repositories.mailboxes.upsertMany(work.account.id, [
      buildMailbox({
        id: mailboxId('mbx-archive'),
        accountId: work.account.id,
        name: 'Archive',
        path: 'Archive',
        role: 'archive',
      }),
      buildMailbox({
        id: mailboxId('mbx-projects'),
        accountId: work.account.id,
        name: 'Projekty',
        path: 'Projekty',
        role: 'custom',
      }),
      buildMailbox({
        id: mailboxId('mbx-tiny'),
        accountId: work.account.id,
        name: 'Zmluvy',
        path: 'Zmluvy',
        role: 'custom',
      }),
    ]);
    archive = stored.find((mailbox) => mailbox.role === 'archive') ?? work.inbox;
    folder = stored.find((mailbox) => mailbox.name === 'Projekty') ?? work.inbox;
    tiny = stored.find((mailbox) => mailbox.name === 'Zmluvy') ?? work.inbox;
    bulkSeedThreads(store, {
      account: work.account,
      mailboxes: { inbox: work.inbox, archive, sent: work.sent, folder, tiny },
      count: THREAD_COUNT,
      newestTs: NEWEST_TS,
    });
  }, 180_000);

  afterAll(() => {
    store.database.close();
    directory.remove();
  });

  it.each(scenarios)('serves the first and a deep $name page within budget', async (scenario) => {
    const deepCursor = timeIdCursor.encode(DEEP_POSITION);
    const first = await store.repositories.threads.queryFolder(
      LOCAL_USER_ID,
      fullQuery(scenario, null),
    );
    const deep = await store.repositories.threads.queryFolder(
      LOCAL_USER_ID,
      fullQuery(scenario, deepCursor),
    );

    expect(first.items.length).toBeGreaterThan(0);
    expect(deep.items.length).toBeGreaterThan(0);
    expect(deep.items.every((thread) => Date.parse(thread.lastMessageAt) < DEEP_POSITION.ts)).toBe(
      true,
    );
    expect(await medianMs(fullQuery(scenario, null))).toBeLessThan(QUERY_BUDGET_MS);
    expect(await medianMs(fullQuery(scenario, deepCursor))).toBeLessThan(QUERY_BUDGET_MS);
  });

  it.each(scenarios)('orders the $name view by an index without a temp b-tree', (scenario) => {
    const plan = planOf(fullQuery(scenario, timeIdCursor.encode(DEEP_POSITION)));
    const threadStep = plan.find((detail) => /\bthreads\b/.test(detail)) ?? '';

    expect(threadStep).toMatch(/^SEARCH threads USING (COVERING )?INDEX threads_/);
    expect(plan.some((detail) => detail.includes('TEMP B-TREE'))).toBe(false);
  });
});

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
const SPARSE_BUDGET_MS = 2;
const DENSE_BUDGET_MS = 15;
const RANGE_PAGES = 20;
const RANGE_BUDGET_MS = 250;
const PRIMARY_KEY_STEP = /^SEARCH threads USING INDEX sqlite_autoindex_threads_1 \(id=\?\)/;
const MAILBOX_STEP = /^SEARCH messages .*INDEX messages_mailbox_thread_idx \(mailbox_id=\?/;
const NEWEST_TS = Date.parse('2026-11-20T10:00:00.000Z');
const DEEP_POSITION = { ts: NEWEST_TS - 150_000 * 60_000, id: 'acc-1-t0150000' };

interface Scenario {
  readonly name: string;
  readonly query: () => Partial<ThreadFolderQuery>;
  readonly mailboxFirst?: boolean;
}

const directory = createTempDirectory();
let store: TestStore;
let folder: Mailbox;
let archive: Mailbox;
let tiny: Mailbox;
let single: Mailbox;

const scenarios: readonly Scenario[] = [
  { name: 'inbox', query: () => ({ view: 'inbox' }) },
  { name: 'inbox of one account', query: () => ({ view: 'inbox', accountId: folder.accountId }) },
  { name: 'done', query: () => ({ view: 'done' }) },
  { name: 'sent', query: () => ({ view: 'sent' }) },
  { name: 'archive mailbox', query: () => ({ view: 'mailbox', mailboxId: archive.id }) },
  { name: 'custom folder', query: () => ({ view: 'mailbox', mailboxId: folder.id }) },
  {
    name: 'tiny folder',
    query: () => ({ view: 'mailbox', mailboxId: tiny.id }),
    mailboxFirst: true,
  },
  {
    name: 'single thread folder',
    query: () => ({ view: 'mailbox', mailboxId: single.id }),
    mailboxFirst: true,
  },
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

const rangeMs = async (
  scenario: Scenario,
): Promise<{ readonly ms: number; readonly threads: number }> => {
  const started = performance.now();
  let cursor: string | null = null;
  let threads = 0;
  for (let page = 0; page < RANGE_PAGES; page += 1) {
    const result = await store.repositories.threads.queryFolder(
      LOCAL_USER_ID,
      fullQuery(scenario, cursor),
    );
    threads += result.items.length;
    cursor = result.nextCursor;
  }
  return { ms: performance.now() - started, threads };
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

const threadStepOf = (plan: readonly string[]): string =>
  plan.find((detail) => /\bthreads\b/.test(detail)) ?? '';

const expectMailboxFirst = (plan: readonly string[]): void => {
  expect(threadStepOf(plan)).toMatch(PRIMARY_KEY_STEP);
  expect(plan.some((detail) => MAILBOX_STEP.test(detail))).toBe(true);
  expect(plan.some((detail) => detail.includes('threads_user_order_idx'))).toBe(false);
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
      buildMailbox({
        id: mailboxId('mbx-single'),
        accountId: work.account.id,
        name: 'Daňový úrad',
        path: 'Danovy urad',
        role: 'custom',
      }),
    ]);
    archive = stored.find((mailbox) => mailbox.role === 'archive') ?? work.inbox;
    folder = stored.find((mailbox) => mailbox.name === 'Projekty') ?? work.inbox;
    tiny = stored.find((mailbox) => mailbox.name === 'Zmluvy') ?? work.inbox;
    single = stored.find((mailbox) => mailbox.path === 'Danovy urad') ?? work.inbox;
    bulkSeedThreads(store, {
      account: work.account,
      mailboxes: { inbox: work.inbox, archive, sent: work.sent, folder, tiny, single },
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

  it.each(scenarios.filter((scenario) => scenario.mailboxFirst !== true))(
    'orders the $name view by an index without a temp b-tree',
    (scenario) => {
      const plan = planOf(fullQuery(scenario, timeIdCursor.encode(DEEP_POSITION)));

      expect(threadStepOf(plan)).toMatch(/^SEARCH threads USING (COVERING )?INDEX threads_/);
      expect(plan.some((detail) => detail.includes('TEMP B-TREE'))).toBe(false);
    },
  );

  it.each(scenarios.filter((scenario) => scenario.mailboxFirst === true))(
    'reads the sparse $name view from its messages and sorts the few threads',
    (scenario) => {
      expectMailboxFirst(planOf(fullQuery(scenario, null)));
      expectMailboxFirst(planOf(fullQuery(scenario, timeIdCursor.encode(DEEP_POSITION))));
    },
  );

  it.each(
    scenarios.filter((scenario) => scenario.mailboxFirst !== true && scenario.name !== 'search'),
  )('re-reads $name as 20 loaded pages within the range refetch budget', async (scenario) => {
    const range = await rangeMs(scenario);

    expect(range.threads).toBe(RANGE_PAGES * PAGE_LIMIT);
    expect(range.ms).toBeLessThan(RANGE_BUDGET_MS);
  });

  it('keeps sparse and dense mailboxes fast once the planner has ANALYZE stats', async () => {
    store.database.sqlite.exec('analyze');
    const dense = scenarios.find((scenario) => scenario.name === 'archive mailbox');
    const sparse = scenarios.filter((scenario) => scenario.mailboxFirst === true);
    expect(dense).toBeDefined();
    if (dense === undefined) {
      return;
    }
    const densePlan = planOf(fullQuery(dense, null));
    const sizes = await Promise.all(
      sparse.map(
        async (scenario) =>
          (await store.repositories.threads.queryFolder(LOCAL_USER_ID, fullQuery(scenario, null)))
            .items.length,
      ),
    );

    expect(sizes).toEqual([20, 1]);
    expect(threadStepOf(densePlan)).toMatch(/^SEARCH threads USING INDEX threads_user_order_idx/);
    expect(densePlan.some((detail) => detail.includes('TEMP B-TREE'))).toBe(false);
    expect(await medianMs(fullQuery(dense, null))).toBeLessThan(DENSE_BUDGET_MS);
    expect(await medianMs(fullQuery(dense, timeIdCursor.encode(DEEP_POSITION)))).toBeLessThan(
      DENSE_BUDGET_MS,
    );
    for (const scenario of sparse) {
      expectMailboxFirst(planOf(fullQuery(scenario, null)));
      expect(await medianMs(fullQuery(scenario, null))).toBeLessThan(SPARSE_BUDGET_MS);
    }
  });
});

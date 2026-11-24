import type { ThreadFolderQuery } from '@relay/engine';
import { type MessageId, type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { ServerRepositories } from '../../../../src/core/ports/server-unit-of-work';
import type { DbExecutor } from '../../../../src/persistence/database/database';
import { type DuplicateFixture, labelIdOf } from './gmail-duplicates-seed';
import { type Spread, spreadOf, timed, warmMedian } from './perf-stats';

export interface QueryTimings {
  readonly inboxMs: number;
  readonly allMailMs: number;
  readonly labelMs: number;
  readonly searchMs: number;
  readonly inboxWalkMs: number;
  readonly detail: Spread;
}

const BASE_QUERY: ThreadFolderQuery = {
  view: 'inbox',
  accountId: null,
  splitId: null,
  labelId: null,
  mailboxId: null,
  search: null,
  cursor: null,
  limit: 50,
};

export const duplicateThreadIds = (fixture: DuplicateFixture, count: number): ThreadId[] =>
  Array.from({ length: Math.min(count, Math.floor(fixture.size / 4)) }, (_, index) => {
    const mail = (index + 1) * 4;
    return ThreadIdSchema.parse(
      `${fixture.accountId}-t-${String(Math.floor(((mail - 1) * 2) / 5) + 1)}`,
    );
  });

const searchTerm = async (db: DbExecutor): Promise<string> => {
  const result = await db.execute<{ term: string }>(
    sql`select split_part(body, ' ', 2) as term from perf_paragraphs where p = 7`,
  );
  return result.rows[0]?.term ?? 'projekt';
};

const walk = async (repositories: ServerRepositories, fixture: DuplicateFixture, pages: number) => {
  let cursor: string | null = null;
  for (let page = 0; page < pages; page += 1) {
    const result = await repositories.threads.queryFolder(fixture.userId, {
      ...BASE_QUERY,
      cursor,
    });
    cursor = result.nextCursor;
    if (cursor === null) {
      return;
    }
  }
};

export const measureQueries = async (
  db: DbExecutor,
  repositories: ServerRepositories,
  fixture: DuplicateFixture,
): Promise<QueryTimings> => {
  const folder = (overrides: Partial<ThreadFolderQuery>) => () =>
    repositories.threads.queryFolder(fixture.userId, { ...BASE_QUERY, ...overrides });
  const term = await searchTerm(db);
  const detail: number[] = [];
  for (const threadId of duplicateThreadIds(fixture, 200)) {
    detail.push(
      (await timed(() => repositories.messages.listByThread(fixture.userId, threadId))).ms,
    );
  }
  return {
    inboxMs: await warmMedian(folder({})),
    allMailMs: await warmMedian(folder({ view: 'mailbox', mailboxId: fixture.allMail })),
    labelMs: await warmMedian(folder({ view: 'label', labelId: labelIdOf(fixture, 1) })),
    searchMs: await warmMedian(folder({ search: term })),
    inboxWalkMs: await warmMedian(() => walk(repositories, fixture, 20), 3),
    detail: spreadOf(detail),
  };
};

export const aliasLookup = async (
  repositories: ServerRepositories,
  fixture: DuplicateFixture,
  loserIds: readonly MessageId[],
): Promise<Spread> => {
  const samples: number[] = [];
  for (const loserId of loserIds.slice(0, 200)) {
    samples.push((await timed(() => repositories.messages.findById(fixture.userId, loserId))).ms);
  }
  return spreadOf(samples);
};

export const threadRefreshProxy = async (
  repositories: ServerRepositories,
  fixture: DuplicateFixture,
  threadIds: readonly ThreadId[],
): Promise<Spread> => {
  const samples: number[] = [];
  for (const threadId of threadIds) {
    const { ms } = await timed(async () => {
      await repositories.messages.listByThread(fixture.userId, threadId);
      const thread = await repositories.threads.findById(fixture.userId, threadId);
      return thread === null ? null : repositories.threads.upsert(thread);
    });
    samples.push(ms);
  }
  return spreadOf(samples);
};

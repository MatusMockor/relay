import { existsSync, statSync } from 'node:fs';
import { type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import { folderQuery } from './folder-scenario';
import type { TestStore } from './test-database';

export interface DbSize {
  readonly fileMb: number;
  readonly walMb: number;
  readonly freelistMb: number;
}

export interface QueryTimes {
  readonly inboxMs: number;
  readonly detailP50Ms: number;
  readonly detailP95Ms: number;
}

const MB = 1024 * 1024;

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));

const fileBytes = (path: string): number => (existsSync(path) ? statSync(path).size : 0);

export const percentile = (samples: readonly number[], share: number): number => {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1);
  return round(sorted[Math.max(0, index)] ?? 0);
};

export const dbSize = (store: TestStore, path: string): DbSize => {
  const pragma = (name: string): number =>
    Number(store.database.sqlite.pragma(name, { simple: true }));
  return {
    fileMb: round(fileBytes(path) / MB),
    walMb: round(fileBytes(`${path}-wal`) / MB),
    freelistMb: round((pragma('freelist_count') * pragma('page_size')) / MB),
  };
};

export const checkpoint = (store: TestStore): void => {
  store.database.sqlite.pragma('wal_checkpoint(TRUNCATE)');
};

const timeOnce = async (run: () => Promise<unknown>): Promise<number> => {
  const started = performance.now();
  await run();
  return performance.now() - started;
};

export const medianOf = async (run: () => Promise<unknown>, runs = 5): Promise<number> => {
  await run();
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    samples.push(await timeOnce(run));
  }
  return percentile(samples, 0.5);
};

export const queryTimes = async (
  store: TestStore,
  threadIds: readonly string[],
): Promise<QueryTimes> => {
  const { threads, messages } = store.repositories;
  const inboxMs = await medianOf(() =>
    threads.queryFolder(LOCAL_USER_ID, folderQuery({ view: 'inbox', limit: 50 })),
  );
  const detail: number[] = [];
  for (const threadId of threadIds) {
    detail.push(
      await medianOf(() => messages.listByThread(LOCAL_USER_ID, ThreadIdSchema.parse(threadId)), 3),
    );
  }
  return {
    inboxMs,
    detailP50Ms: percentile(detail, 0.5),
    detailP95Ms: percentile(detail, 0.95),
  };
};

export const rssMb = (): number => round(process.memoryUsage().rss / MB);

export const heapMb = (): number => round(process.memoryUsage().heapUsed / MB);

export const maxRssMb = (): number => round(process.resourceUsage().maxRSS / 1024);

export const refreshProxyMs = async (
  store: TestStore,
  threadIds: readonly ThreadId[],
): Promise<number> => {
  const started = performance.now();
  await store.unitOfWork.run(async (repositories) => {
    for (const threadId of threadIds) {
      await repositories.messages.listByThread(LOCAL_USER_ID, threadId);
      const thread = await repositories.threads.findById(LOCAL_USER_ID, threadId);
      if (thread !== null) {
        await repositories.threads.upsert(thread);
      }
    }
  });
  return performance.now() - started;
};

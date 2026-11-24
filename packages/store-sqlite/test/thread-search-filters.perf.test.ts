import type { ThreadFolderQuery } from '@relay/engine';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { folderQuery } from './support/folder-scenario';
import { seedSearchPerfMailbox } from './support/search-perf-seed';
import { seedAccount } from './support/seed';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
} from './support/test-database';

const MESSAGE_COUNT = 100_000;
const RUNS = 30;
const P95_BUDGET_MS = 150;

const QUERIES: readonly (readonly [string, Partial<ThreadFolderQuery>])[] = [
  ['everywhere text', { everywhere: true, search: 'faktura' }],
  ['everywhere two terms', { everywhere: true, search: 'zmluva projekt' }],
  ['everywhere sender', { everywhere: true, search: 'jana', searchField: 'from' }],
  ['inbox subject', { search: 'rozpocet', searchField: 'subject' }],
  ['everywhere attachment', { everywhere: true, search: 'audit', hasAttachment: true }],
  ['everywhere unread', { everywhere: true, search: 'servis', unread: true }],
  [
    'every filter',
    { everywhere: true, search: 'tim', searchField: 'subject', hasAttachment: true, unread: true },
  ],
  ['inbox attachment only', { hasAttachment: true }],
  ['everywhere unread only', { everywhere: true, unread: true }],
];

const p95 = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
};

describe.runIf(process.env.RELAY_PERF === '1')('filtered search performance', () => {
  let directory: TempDirectory;
  let store: TestStore;

  beforeAll(async () => {
    directory = createTempDirectory();
    store = createTestStore(join(directory.path, 'perf.db'));
    const seeded = await seedAccount(store.repositories);
    const started = performance.now();
    seedSearchPerfMailbox(store, seeded, MESSAGE_COUNT);
    process.stdout.write(
      `seeded ${String(MESSAGE_COUNT)} messages in ${(performance.now() - started).toFixed(0)} ms\n`,
    );
  }, 300_000);

  afterAll(() => {
    store.database.close();
    directory.remove();
  });

  it.each(QUERIES)('keeps %s under the p95 budget', async (name, overrides) => {
    const query = folderQuery({ ...overrides, limit: 50 });
    const samples: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      await store.repositories.threads.queryFolder(LOCAL_USER_ID, query);
      samples.push(performance.now() - started);
    }
    const measured = p95(samples);
    process.stdout.write(`${name}: p95 ${measured.toFixed(1)} ms\n`);
    expect(measured).toBeLessThan(P95_BUDGET_MS);
  });
});

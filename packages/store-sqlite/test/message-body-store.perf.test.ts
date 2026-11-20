import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSqliteMessageBodies } from '../src';
import { bodyMessage, seedBodyRows } from './support/body-store-seed';
import { type SeededAccount, seedAccount } from './support/seed';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
} from './support/test-database';

const MESSAGE_COUNT = 50_000;
const CHUNK = 200;
const CHUNKS = 40;
const P95_BUDGET_MS = 50;
const CUTOFF = new Date('2026-05-20T00:00:00.000Z');
const BODY = 'Dobrý deň, posielam faktúru, zmluvu a rozpočet na projekt. '.repeat(40);

const p95 = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
};

describe.runIf(process.env.RELAY_PERF === '1')('offline body eviction performance', () => {
  let directory: TempDirectory;
  let store: TestStore;
  let seeded: SeededAccount;

  beforeAll(async () => {
    directory = createTempDirectory();
    store = createTestStore(join(directory.path, 'perf.db'));
    seeded = await seedAccount(store.repositories);
    seedBodyRows(
      store,
      Array.from({ length: MESSAGE_COUNT }, (_, index) =>
        bodyMessage(seeded, index, index % 1500, { textBody: `${BODY} ${String(index)}` }),
      ),
    );
  });

  afterAll(() => {
    store.database.close();
    directory.remove();
  });

  it('evicts a chunk of 200 bodies within the event loop budget', async () => {
    const bodies = createSqliteMessageBodies(store.database);
    const samples: number[] = [];
    for (let chunk = 0; chunk < CHUNKS; chunk += 1) {
      const started = performance.now();
      expect(await bodies.evictBefore(seeded.account.id, CUTOFF, CHUNK)).toBe(CHUNK);
      samples.push(performance.now() - started);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    process.stdout.write(
      `eviction chunk of ${String(CHUNK)}: median ${(sorted[CHUNKS / 2] ?? 0).toFixed(1)} ms, p95 ${p95(samples).toFixed(1)} ms\n`,
    );
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
  });
});

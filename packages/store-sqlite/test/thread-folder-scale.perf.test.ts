import type { ThreadFolderQuery } from '@relay/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { type FolderScale, seedFolderScale } from './support/folder-scale-fixture';
import {
  deepCursorOf,
  folderScaleScenarios,
  SCALE_PAGE_LIMIT,
  type Scenario,
  scenarioQuery,
} from './support/folder-scale-scenarios';

const THREAD_COUNT = 200_000;
const QUERY_BUDGET_MS = 50;
const SPARSE_BUDGET_MS = 2;
const DENSE_BUDGET_MS = 15;
const RANGE_PAGES = 20;
const RANGE_BUDGET_MS = 250;

let scale: FolderScale;
const scenarios = folderScaleScenarios(() => scale);
const report = (label: string, ms: number): void => {
  process.stdout.write(`${label}: ${ms.toFixed(1)} ms\n`);
};

const medianMs = async (query: ThreadFolderQuery): Promise<number> => {
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    await scale.store.repositories.threads.queryFolder(LOCAL_USER_ID, query);
    samples.push(performance.now() - started);
  }
  return samples.sort((left, right) => left - right)[2] ?? Number.POSITIVE_INFINITY;
};

const rangeOf = async (scenario: Scenario): Promise<{ ms: number; threads: number }> => {
  const started = performance.now();
  let cursor: string | null = null;
  let threads = 0;
  for (let page = 0; page < RANGE_PAGES; page += 1) {
    const result = await scale.store.repositories.threads.queryFolder(
      LOCAL_USER_ID,
      scenarioQuery(scenario, cursor),
    );
    threads += result.items.length;
    cursor = result.nextCursor;
  }
  return { ms: performance.now() - started, threads };
};

describe.runIf(process.env.RELAY_PERF === '1')(
  `SqliteThreadRepository.queryFolder latency with ${String(THREAD_COUNT)} threads`,
  () => {
    beforeAll(async () => {
      const started = performance.now();
      scale = await seedFolderScale(THREAD_COUNT);
      report(`seeded ${String(THREAD_COUNT)} threads`, performance.now() - started);
    }, 180_000);

    afterAll(() => {
      scale.tearDown();
    });

    it.each(scenarios)('serves the first and a deep $name page within budget', async (scenario) => {
      const first = await medianMs(scenarioQuery(scenario, null));
      const deep = await medianMs(scenarioQuery(scenario, deepCursorOf(scale)));
      report(`${scenario.name} first`, first);
      report(`${scenario.name} deep`, deep);

      expect(first).toBeLessThan(QUERY_BUDGET_MS);
      expect(deep).toBeLessThan(QUERY_BUDGET_MS);
    });

    it.each(
      scenarios.filter((scenario) => scenario.mailboxFirst !== true && scenario.name !== 'search'),
    )('re-reads $name as 20 loaded pages within the range refetch budget', async (scenario) => {
      const range = await rangeOf(scenario);
      report(`${scenario.name} range of ${String(RANGE_PAGES)} pages`, range.ms);

      expect(range.threads).toBe(RANGE_PAGES * SCALE_PAGE_LIMIT);
      expect(range.ms).toBeLessThan(RANGE_BUDGET_MS);
    });

    it('keeps sparse and dense mailboxes fast once the planner has ANALYZE stats', async () => {
      scale.store.database.sqlite.exec('analyze');
      const dense = scenarios.find((scenario) => scenario.name === 'archive mailbox');
      expect(dense).toBeDefined();
      if (dense === undefined) {
        return;
      }
      const denseFirst = await medianMs(scenarioQuery(dense, null));
      const denseDeep = await medianMs(scenarioQuery(dense, deepCursorOf(scale)));
      report('analyzed archive first', denseFirst);
      report('analyzed archive deep', denseDeep);

      expect(denseFirst).toBeLessThan(DENSE_BUDGET_MS);
      expect(denseDeep).toBeLessThan(DENSE_BUDGET_MS);
      for (const scenario of scenarios.filter((candidate) => candidate.mailboxFirst === true)) {
        const sparse = await medianMs(scenarioQuery(scenario, null));
        report(`analyzed ${scenario.name}`, sparse);
        expect(sparse).toBeLessThan(SPARSE_BUDGET_MS);
      }
    });
  },
);

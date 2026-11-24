import { isHeldThreadState } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { type FolderScale, seedFolderScale } from './support/folder-scale-fixture';
import {
  deepCursorOf,
  expectMailboxFirst,
  folderScaleScenarios,
  planOf,
  scenarioQuery,
  threadStepOf,
  usesTempBTree,
} from './support/folder-scale-scenarios';
import { folderQuery } from './support/folder-scenario';

const THREAD_COUNT = 40_000;
const ORDER_INDEX_STEP = /^SEARCH threads USING (COVERING )?INDEX threads_/;

let scale: FolderScale;
const scenarios = folderScaleScenarios(() => scale);
const dense = scenarios.filter((scenario) => scenario.mailboxFirst !== true);
const sparse = scenarios.filter((scenario) => scenario.mailboxFirst === true);

describe(`SqliteThreadRepository.queryFolder plans with ${String(THREAD_COUNT)} threads`, () => {
  beforeAll(async () => {
    scale = await seedFolderScale(THREAD_COUNT);
  }, 60_000);

  afterAll(() => {
    scale.tearDown();
  });

  it.each(scenarios)('serves the first and a deep $name page', async (scenario) => {
    const { threads } = scale.store.repositories;
    const first = await threads.queryFolder(LOCAL_USER_ID, scenarioQuery(scenario, null));
    const deep = await threads.queryFolder(
      LOCAL_USER_ID,
      scenarioQuery(scenario, deepCursorOf(scale)),
    );

    expect(first.items.length).toBeGreaterThan(0);
    expect(deep.items.length).toBeGreaterThan(0);
    expect(
      deep.items.every((thread) => Date.parse(thread.lastMessageAt) < scale.deepPosition.ts),
    ).toBe(true);
  });

  it.each(dense)('orders the $name view by an index without a temp b-tree', (scenario) => {
    const plan = planOf(scale, scenarioQuery(scenario, deepCursorOf(scale)));

    expect(threadStepOf(plan)).toMatch(ORDER_INDEX_STEP);
    expect(usesTempBTree(plan)).toBe(false);
    expect(plan.some((detail) => detail.includes('message_placements_mailbox_uid_idx'))).toBe(
      false,
    );
  });

  it.each(sparse)('reads the sparse $name view from its messages', (scenario) => {
    expectMailboxFirst(planOf(scale, scenarioQuery(scenario, null)));
    expectMailboxFirst(planOf(scale, scenarioQuery(scenario, deepCursorOf(scale))));
  });

  it('walks everything outside trash and spam by the owner order indexes', async () => {
    const accountId = scale.mailboxes.inbox.accountId;
    const everywhere = folderQuery({ everywhere: true, limit: 200 });
    const ofAccount = folderQuery({ everywhere: true, accountId, limit: 200 });
    const leftoverMailbox = folderQuery({
      everywhere: true,
      view: 'mailbox',
      mailboxId: scale.mailboxes.tiny.id,
      limit: 200,
    });
    const page = await scale.store.repositories.threads.queryFolder(LOCAL_USER_ID, leftoverMailbox);

    for (const [query, index] of [
      [everywhere, 'threads_user_order_idx'],
      [ofAccount, 'threads_account_order_idx'],
      [leftoverMailbox, 'threads_user_order_idx'],
    ] as const) {
      const plan = planOf(scale, query);
      expect(threadStepOf(plan)).toMatch(new RegExp(`^SEARCH threads USING INDEX ${index}`));
      expect(usesTempBTree(plan)).toBe(false);
    }
    expect(page.items).toHaveLength(200);
    expect(page.items.some((thread) => isHeldThreadState(thread.state))).toBe(false);
  });

  it('keeps the sparse and dense mailbox plans once the planner has ANALYZE stats', async () => {
    scale.store.database.sqlite.exec('analyze');
    const archive = scenarios.find((scenario) => scenario.name === 'archive mailbox');
    expect(archive).toBeDefined();
    if (archive === undefined) {
      return;
    }
    const densePlan = planOf(scale, scenarioQuery(archive, null));
    const sizes = await Promise.all(
      sparse.map(
        async (scenario) =>
          (
            await scale.store.repositories.threads.queryFolder(
              LOCAL_USER_ID,
              scenarioQuery(scenario, null),
            )
          ).items.length,
      ),
    );

    expect(sizes).toEqual([scale.tinyFolderThreads, 1]);
    expect(threadStepOf(densePlan)).toMatch(/^SEARCH threads USING INDEX threads_user_order_idx/);
    expect(usesTempBTree(densePlan)).toBe(false);
    for (const scenario of sparse) {
      expectMailboxFirst(planOf(scale, scenarioQuery(scenario, null)));
    }
  });
});

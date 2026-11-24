import { describe, expect, it } from 'vitest';
import {
  copyMergeRow,
  enqueueCopyMerge,
  expectMergeInvariants,
  storedMessages,
} from '../support/copy-merge';
import { present } from '../support/fixtures';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { MemoryMessageMerges } from '../support/memory/memory-message-merges';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPECS: readonly LegacySpec[] = ['a', 'b', 'c'].map((id, index) => ({
  id: `p${id}`,
  subject: `Dávka ${id}`,
  date: `2026-11-14T0${String(index + 1)}:00:00.000Z`,
}));

const ONE_GROUP_PER_SYNC = { copyMerge: { chunkMessages: 2, sliceMs: 0, resolveBatch: 1_000 } };

const memoryMerges = (engine: TestEngine): MemoryMessageMerges => {
  expect(engine.repositories.messageMerges).toBeInstanceOf(MemoryMessageMerges);
  return engine.repositories.messageMerges as MemoryMessageMerges;
};

const sortedIds = (engine: TestEngine): string[] =>
  storedMessages(engine)
    .map((message) => message.id)
    .sort();

const referenceTables = (engine: TestEngine) => {
  const { messages, messageAliases, automationRuns, drafts, aiJobs } = engine.db.tables;
  return structuredClone({ messages, messageAliases, automationRuns, drafts, aiJobs });
};

describe('CopyMergeBackfill resume', () => {
  it('spreads the merge over several syncs when the budget runs out', async () => {
    const engine = createTestEngine({ sync: ONE_GROUP_PER_SYNC });
    const { account, pairs } = await seedLegacyDuplicates(engine, SPECS);
    await enqueueCopyMerge(engine, account.id);
    const emailIds = SPECS.map((spec) => `gm-${spec.id}@mail.test`);

    const progress: (string | null)[] = [];
    const counts: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      await engine.services.sync.syncAccount(USER_ID, account.id);
      progress.push(present(await copyMergeRow(engine, account.id)).payload.afterEmailId);
      counts.push(storedMessages(engine).length);
    }

    expect(progress).toEqual(emailIds);
    expect(counts).toEqual([5, 4, 3]);
    expect(sortedIds(engine)).toEqual(pairs.map((pair) => pair.keeperId).sort());
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await copyMergeRow(engine, account.id))?.payload.pass.merged).toBe(0);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expectMergeInvariants(engine);
  });

  it('rolls a failed chunk back and completes it on the next sync', async () => {
    const engine = createTestEngine({ sync: ONE_GROUP_PER_SYNC });
    const { account, pairs } = await seedLegacyDuplicates(engine, SPECS);
    await enqueueCopyMerge(engine, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const cursor = present(await copyMergeRow(engine, account.id));
    const before = referenceTables(engine);
    memoryMerges(engine).failAfterRemap = 'boom';

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(referenceTables(engine)).toEqual(before);
    expect((await copyMergeRow(engine, account.id))?.payload).toEqual(cursor.payload);
    expect(engine.logger.entries.map((entry) => entry.message)).toContain('Copy merge paused');
    memoryMerges(engine).failAfterRemap = null;

    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(sortedIds(engine)).toEqual(pairs.map((pair) => pair.keeperId).sort());
    expectMergeInvariants(engine);
  });
});

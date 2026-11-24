import type { Mailbox, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { backfillUntilDone, seedHistory, storedMessages } from '../support/history';
import { MemoryPendingWorkRepository } from '../support/memory/memory-pending-work-repository';
import { MemoryThreadRepository } from '../support/memory/memory-thread-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

interface Setup {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
  readonly inbox: Mailbox;
}

const setup = async (history: number): Promise<Setup> => {
  const engine = createTestEngine();
  const seeded = await seedAccount(engine);
  seedHistory(seeded.server, 'INBOX', history);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const inbox = present(await engine.repositories.mailboxes.findByPath(seeded.account.id, 'INBOX'));
  engine.events.clear();
  return { engine, seeded, inbox };
};

const memoryPendingWork = (engine: TestEngine): MemoryPendingWorkRepository => {
  expect(engine.repositories.pendingWork).toBeInstanceOf(MemoryPendingWorkRepository);
  return engine.repositories.pendingWork as MemoryPendingWorkRepository;
};

const memoryThreads = (engine: TestEngine): MemoryThreadRepository => {
  expect(engine.repositories.threads).toBeInstanceOf(MemoryThreadRepository);
  return engine.repositories.threads as MemoryThreadRepository;
};

const historyThreadIds = (engine: TestEngine): ThreadId[] =>
  storedMessages(engine)
    .filter((message) => message.bodyState === 'remote')
    .map((message) => message.threadId);

const threadRefreshWork = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'thread-refresh');

const upsertedThreadIds = (engine: TestEngine): ThreadId[] =>
  engine.events.ofType('thread.upserted').map((event) => event.data.thread.id);

describe('history backfill failures', () => {
  it('keeps history threads silent when a regular sync flushes work left by a failed batch', async () => {
    const { engine, seeded } = await setup(5);
    memoryPendingWork(engine).failPutAfter = 2;

    await expect(engine.services.sync.backfillHistory(USER_ID, seeded.account.id)).rejects.toThrow(
      'database is locked',
    );

    memoryPendingWork(engine).failPutAfter = null;
    const leftover = historyThreadIds(engine);
    expect(leftover).toHaveLength(2);
    expect(threadRefreshWork(engine).map((work) => work.payload)).toEqual([
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({ quiet: true }),
    ]);
    deliverMail(seeded.server, 'INBOX', { id: 'fresh' });

    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);

    const upserted = upsertedThreadIds(engine);
    expect(upserted.some((threadId) => leftover.includes(threadId))).toBe(false);
    const fresh = present(storedMessages(engine).find((message) => message.bodyState !== 'remote'));
    expect(upserted).toContain(fresh.threadId);
    expect(engine.events.ofType('threads.changed').map((event) => event.data)).toEqual([
      { accountId: seeded.account.id, count: 2 },
    ]);
    expect(leftover.every((threadId) => engine.db.tables.threads.has(threadId))).toBe(true);
    expect(threadRefreshWork(engine)).toEqual([]);

    engine.events.clear();
    await backfillUntilDone(engine, seeded.account.id);

    const history = historyThreadIds(engine);
    expect(history).toHaveLength(5);
    expect(history.every((threadId) => engine.db.tables.threads.has(threadId))).toBe(true);
    expect(engine.events.ofType('thread.upserted')).toEqual([]);
  });

  it('refreshes thread summaries of a committed batch whose flush failed before the cursor passes it', async () => {
    const { engine, seeded, inbox } = await setup(3);
    memoryThreads(engine).failUpsert = 'disk full';

    await expect(engine.services.sync.backfillHistory(USER_ID, seeded.account.id)).rejects.toThrow(
      'disk full',
    );

    const stored = storedMessages(engine).filter((message) => message.bodyState === 'remote');
    expect(stored).toHaveLength(3);
    expect(stored.some((message) => engine.db.tables.threads.has(message.threadId))).toBe(false);
    const failed = present(engine.db.tables.historyCursors.get(inbox.id));
    expect(failed.doneAt).toBeNull();
    expect(failed.belowUid).toBeGreaterThan(Math.max(...stored.map((message) => message.uid)));

    await expect(engine.services.sync.backfillHistory(USER_ID, seeded.account.id)).rejects.toThrow(
      'disk full',
    );

    expect(engine.db.tables.historyCursors.get(inbox.id)).toEqual(failed);
    memoryThreads(engine).failUpsert = null;

    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, more: false });
    expect(stored.every((message) => engine.db.tables.threads.has(message.threadId))).toBe(true);
    expect(present(engine.db.tables.historyCursors.get(inbox.id)).doneAt).not.toBeNull();
    expect(threadRefreshWork(engine)).toEqual([]);
    expect(engine.events.ofType('thread.upserted')).toEqual([]);
    expect(engine.events.ofType('threads.changed').map((event) => event.data)).toEqual([
      { accountId: seeded.account.id, count: 3 },
    ]);
  });
});

import type { AccountId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { SyncJournal } from '../../src/services/sync/sync-journal';
import { emptyThreadWork } from '../../src/services/sync/thread-refresh-work';
import { present } from '../support/fixtures';
import { ManualClock } from '../support/fakes/infrastructure';
import { MemoryDatabase } from '../support/memory/memory-database';
import { MemoryPendingWorkRepository } from '../support/memory/memory-pending-work-repository';
import { TEST_NOW } from '../support/test-engine';

const ACCOUNT_ID = 'account_1' as AccountId;
const THREAD_ID = 'thread_1' as ThreadId;

const setup = () => {
  const work = new MemoryPendingWorkRepository(new MemoryDatabase());
  const clock = new ManualClock(TEST_NOW);
  return {
    work,
    clock,
    quiet: new SyncJournal(ACCOUNT_ID, clock, { quiet: true }),
    regular: new SyncJournal(ACCOUNT_ID, clock),
  };
};

const storedPayload = async (work: MemoryPendingWorkRepository) =>
  present(await work.find({ accountId: ACCOUNT_ID, kind: 'thread-refresh', ref: THREAD_ID }))
    .payload;

describe('sync journal thread work origin', () => {
  it('marks thread work journaled only by the quiet journal as quiet', async () => {
    const { work, quiet } = setup();

    await quiet.touched(work, THREAD_ID);
    await quiet.touched(work, THREAD_ID);

    expect(await storedPayload(work)).toMatchObject({ threadId: THREAD_ID, quiet: true });
  });

  it('keeps thread work regular once a regular sync journals the same thread', async () => {
    const { work, quiet, regular } = setup();

    await quiet.touched(work, THREAD_ID);
    await regular.touched(work, THREAD_ID);
    await quiet.touched(work, THREAD_ID);

    expect(await storedPayload(work)).not.toHaveProperty('quiet');
  });

  it('treats stored thread work without the flag as regular', async () => {
    const { work, quiet, clock } = setup();
    await work.put({
      accountId: ACCOUNT_ID,
      kind: 'thread-refresh',
      ref: THREAD_ID,
      payload: emptyThreadWork(THREAD_ID),
      createdAt: clock.now().toISOString(),
    });

    await quiet.touched(work, THREAD_ID);

    expect(await storedPayload(work)).not.toHaveProperty('quiet');
  });
});

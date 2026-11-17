import type { AccountId, MailboxId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { MailboxSyncState } from '../../src';
import { createTestEngine, TEST_NOW } from '../support/test-engine';

const syncState = (mailboxId: string): MailboxSyncState => ({
  accountId: 'acc_1' as AccountId,
  mailboxId: mailboxId as MailboxId,
  uidValidity: 1,
  lastUid: 1,
  highestModseq: null,
  initialSyncPending: false,
  syncedAt: TEST_NOW,
});

const deferred = () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
};

describe('MemoryUnitOfWork', () => {
  it('keeps writes of a concurrent run when another run rolls back later', async () => {
    const engine = createTestEngine();
    const failing = deferred();
    const started = deferred();

    const rolledBack = engine.unitOfWork.run(async (repositories) => {
      await repositories.syncStates.save(syncState('mbx_failing'));
      started.release();
      await failing.gate;
      return Promise.reject(new Error('rolled back'));
    });
    await started.gate;
    const committed = engine.unitOfWork.run((repositories) =>
      repositories.syncStates.save(syncState('mbx_committed')),
    );
    failing.release();

    await expect(rolledBack).rejects.toThrow('rolled back');
    await committed;
    expect(await engine.repositories.syncStates.find('mbx_failing' as MailboxId)).toBeNull();
    expect(await engine.repositories.syncStates.find('mbx_committed' as MailboxId)).toEqual(
      syncState('mbx_committed'),
    );
  });

  it('runs a nested unit of work inside the outer one instead of waiting for it', async () => {
    const engine = createTestEngine();

    const result = await engine.unitOfWork.run(() =>
      engine.unitOfWork.run(async (repositories) => {
        await repositories.syncStates.save(syncState('mbx_nested'));
        return 'done';
      }),
    );

    expect(result).toBe('done');
    expect(await engine.repositories.syncStates.find('mbx_nested' as MailboxId)).not.toBeNull();
  });
});

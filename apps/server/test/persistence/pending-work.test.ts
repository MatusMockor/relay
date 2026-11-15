import type { PendingWorkInput } from '@relay/engine';
import { MessageIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, seedAccount, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const refreshWork = (
  seeded: SeededAccount,
  ref: string,
  createdAt: string,
): PendingWorkInput<'thread-refresh'> => ({
  accountId: seeded.account.id,
  kind: 'thread-refresh',
  ref,
  payload: {
    threadId: ThreadIdSchema.parse(ref),
    addSplitIds: [],
    arrivedIn: ['inbox'],
    jiraKey: null,
    jiraActor: null,
    expungedFromInbox: false,
  },
  createdAt,
});

describe('PgPendingWorkRepository', () => {
  const context = usePgTestContext();

  it('upserts work by key, gives it a new revision and lists it in creation order', async () => {
    const seeded = await seedAccount(context.repositories);
    const { pendingWork } = context.repositories;
    await pendingWork.put(refreshWork(seeded, 'thr-b', at(1)));
    const first = await pendingWork.put(refreshWork(seeded, 'thr-a', at(0)));
    const replaced = await pendingWork.put({
      ...refreshWork(seeded, 'thr-a', at(0)),
      payload: { ...first.payload, expungedFromInbox: true },
    });
    await pendingWork.put({
      accountId: seeded.account.id,
      kind: 'provider-op',
      ref: 'msg-1:move',
      payload: {
        messageId: MessageIdSchema.parse('msg-1'),
        change: { kind: 'move', role: 'archive' },
      },
      createdAt: at(0),
    });

    expect(replaced.revision).not.toBe(first.revision);
    const listed = await pendingWork.list(seeded.account.id, 'thread-refresh');
    expect(
      listed.map((work) => [work.ref, work.payload.expungedFromInbox, work.createdAt]),
    ).toEqual([
      ['thr-a', true, at(0)],
      ['thr-b', false, at(1)],
    ]);
  });

  it('removes work only at the revision that was read', async () => {
    const seeded = await seedAccount(context.repositories);
    const { pendingWork } = context.repositories;
    const stale = await pendingWork.put(refreshWork(seeded, 'thr-a', at(0)));
    const fresh = await pendingWork.put(refreshWork(seeded, 'thr-a', at(0)));

    await pendingWork.remove([stale]);
    await expect(pendingWork.find(stale)).resolves.toMatchObject({ revision: fresh.revision });
    await pendingWork.remove([fresh]);
    await expect(pendingWork.find(stale)).resolves.toBeNull();
  });

  it('drops the work of a deleted account', async () => {
    const seeded = await seedAccount(context.repositories);
    const { pendingWork, accounts } = context.repositories;
    await pendingWork.put(refreshWork(seeded, 'thr-a', at(0)));

    await accounts.delete(seeded.user.id, seeded.account.id);

    await expect(pendingWork.list(seeded.account.id, 'thread-refresh')).resolves.toEqual([]);
  });
});

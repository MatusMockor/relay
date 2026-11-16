import type { PendingWorkInput } from '@relay/engine';
import {
  DraftIdSchema,
  MessageIdSchema,
  ScheduledSendIdSchema,
  ThreadIdSchema,
} from '@relay/shared/domain';
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

    await expect(pendingWork.remove([stale])).resolves.toBe(0);
    await expect(pendingWork.find(stale)).resolves.toMatchObject({ revision: fresh.revision });
    await expect(pendingWork.remove([fresh])).resolves.toBe(1);
    await expect(pendingWork.find(stale)).resolves.toBeNull();
  });

  it('drops the work of a deleted account', async () => {
    const seeded = await seedAccount(context.repositories);
    const { pendingWork, accounts } = context.repositories;
    await pendingWork.put(refreshWork(seeded, 'thr-a', at(0)));

    await accounts.delete(seeded.user.id, seeded.account.id);

    await expect(pendingWork.list(seeded.account.id, 'thread-refresh')).resolves.toEqual([]);
  });

  it('lists work of one kind across accounts', async () => {
    const first = await seedAccount(context.repositories);
    const second = await seedAccount(context.repositories);
    const { pendingWork } = context.repositories;
    const sent = (seeded: SeededAccount, ref: string, createdAt: string) =>
      pendingWork.put({
        accountId: seeded.account.id,
        kind: 'scheduled-send-sent',
        ref,
        payload: {
          scheduledSendId: ScheduledSendIdSchema.parse(ref),
          userId: seeded.user.id,
          draftId: DraftIdSchema.parse(`${ref}-draft`),
          draftUpdatedAt: at(0),
          sentAt: createdAt,
          claimedAt: at(0),
        },
        createdAt,
      });
    await sent(second, 'sch-b', at(2));
    await sent(first, 'sch-a', at(1));
    await pendingWork.put(refreshWork(first, 'thr-z', at(0)));

    const listed = await pendingWork.listByKind('scheduled-send-sent');

    const mine = listed.filter((work) =>
      [first.account.id, second.account.id].includes(work.accountId),
    );
    expect(mine.map((work) => [work.accountId, work.ref])).toEqual([
      [first.account.id, 'sch-a'],
      [second.account.id, 'sch-b'],
    ]);
  });

  it('replaces the payload only while the revision is unchanged', async () => {
    const seeded = await seedAccount(context.repositories);
    const { pendingWork } = context.repositories;
    const read = await pendingWork.put(refreshWork(seeded, 'thr-r', '2026-11-15T10:00:00.000Z'));
    const requeued = await pendingWork.put({
      ...refreshWork(seeded, 'thr-r', '2026-11-15T10:00:00.000Z'),
      payload: { ...read.payload, expungedFromInbox: true },
    });

    const stale = await pendingWork.replace(read, {
      ...read.payload,
      jiraKey: null,
      arrivedIn: [],
    });
    const fresh = await pendingWork.replace(requeued, { ...requeued.payload, arrivedIn: [] });

    expect(stale).toBeNull();
    expect(fresh?.payload).toMatchObject({ expungedFromInbox: true, arrivedIn: [] });
    expect(fresh?.revision).not.toBe(requeued.revision);
    expect(await pendingWork.find(read)).toEqual(fresh);
  });
});

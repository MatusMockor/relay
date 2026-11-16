import type { PendingWorkInput } from '@relay/engine';
import { MessageIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

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

describe('SqlitePendingWorkRepository', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('upserts work by key, gives it a new revision and lists it in creation order', async () => {
    const { pendingWork } = store.repositories;
    await pendingWork.put(refreshWork(seeded, 'thr-b', '2026-11-10T10:00:01.000Z'));
    const first = await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));
    const replaced = await pendingWork.put({
      ...refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'),
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
      createdAt: '2026-11-10T09:00:00.000Z',
    });

    expect(replaced.revision).not.toBe(first.revision);
    const listed = await pendingWork.list(seeded.account.id, 'thread-refresh');
    expect(listed.map((work) => [work.ref, work.payload.expungedFromInbox])).toEqual([
      ['thr-a', true],
      ['thr-b', false],
    ]);
    expect(
      await pendingWork.find({
        accountId: seeded.account.id,
        kind: 'thread-refresh',
        ref: 'thr-x',
      }),
    ).toBeNull();
  });

  it('lists work of one kind across accounts', async () => {
    const { pendingWork } = store.repositories;
    const other = await seedAccount(store.repositories, {
      id: accountId('acc-2'),
      email: 'druhy@firma.sk',
    });
    await pendingWork.put(refreshWork(other, 'thr-b', '2026-11-10T10:00:01.000Z'));
    await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));

    const listed = await pendingWork.listByKind('thread-refresh');

    expect(listed.map((work) => [work.accountId, work.ref])).toEqual([
      [seeded.account.id, 'thr-a'],
      [other.account.id, 'thr-b'],
    ]);
    expect(await pendingWork.listByKind('scheduled-send-sent')).toEqual([]);
  });

  it('removes work only at the revision that was read', async () => {
    const { pendingWork } = store.repositories;
    const stale = await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));
    const fresh = await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));

    expect(await pendingWork.remove([stale])).toBe(0);
    expect(await pendingWork.find(stale)).toMatchObject({ revision: fresh.revision });
    expect(await pendingWork.remove([fresh])).toBe(1);
    expect(await pendingWork.find(stale)).toBeNull();
  });

  it('does not let a stale removal delete work recreated with the same key', async () => {
    const { pendingWork } = store.repositories;
    const stale = await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));
    await pendingWork.remove([stale]);
    const recreated = await pendingWork.put(
      refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'),
    );

    await pendingWork.remove([stale]);

    expect(await pendingWork.find(stale)).toMatchObject({ revision: recreated.revision });
  });

  it('drops the work of a deleted account', async () => {
    const { pendingWork, accounts } = store.repositories;
    await pendingWork.put(refreshWork(seeded, 'thr-a', '2026-11-10T10:00:00.000Z'));

    await accounts.delete(seeded.account.userId, seeded.account.id);

    expect(await pendingWork.list(seeded.account.id, 'thread-refresh')).toEqual([]);
  });

  it('replaces the payload only while the revision is unchanged', async () => {
    const { pendingWork } = store.repositories;
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

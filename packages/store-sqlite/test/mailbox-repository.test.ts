import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, buildAccount, buildMailbox, mailboxId, userId } from './support/fixtures';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteMailboxRepository and SqliteSyncStateRepository', () => {
  let store: TestStore;
  const account = accountId('acc-1');

  beforeEach(async () => {
    store = createTestStore();
    await store.repositories.accounts.create(buildAccount());
  });

  afterEach(() => {
    store.database.close();
  });

  it('upserts mailboxes by path and keeps existing ids', async () => {
    const { mailboxes } = store.repositories;
    await mailboxes.upsertMany(account, [buildMailbox()]);

    const stored = await mailboxes.upsertMany(account, [
      buildMailbox({ id: mailboxId('mbx-new-id'), unreadCount: 3, totalCount: 10 }),
      buildMailbox({ id: mailboxId('mbx-sent'), name: 'Sent', path: 'Sent', role: 'sent' }),
    ]);

    expect(stored.map((mailbox) => [mailbox.id, mailbox.path, mailbox.unreadCount])).toEqual([
      ['mbx-inbox', 'INBOX', 3],
      ['mbx-sent', 'Sent', 0],
    ]);
    expect((await mailboxes.findByRole(account, 'sent'))?.id).toBe('mbx-sent');
    expect((await mailboxes.findByPath(account, 'INBOX'))?.totalCount).toBe(10);
    expect(await mailboxes.findById(mailboxId('mbx-sent'))).toMatchObject({ name: 'Sent' });
    expect(await mailboxes.findByRole(account, 'trash')).toBeNull();
  });

  it('lists mailboxes only for the owning user', async () => {
    const { mailboxes } = store.repositories;
    await mailboxes.upsertMany(account, [buildMailbox()]);

    expect(await mailboxes.listByAccount(LOCAL_USER_ID, account)).toHaveLength(1);
    expect(await mailboxes.listByAccount(userId('intruder'), account)).toEqual([]);
  });

  it('deletes missing mailboxes and updates counts', async () => {
    const { mailboxes } = store.repositories;
    await mailboxes.upsertMany(account, [
      buildMailbox(),
      buildMailbox({ id: mailboxId('mbx-old'), name: 'Old', path: 'Old', role: 'custom' }),
    ]);

    expect(await mailboxes.deleteMissing(account, ['INBOX'])).toEqual(['mbx-old']);
    await mailboxes.updateCounts(mailboxId('mbx-inbox'), { unreadCount: 7, totalCount: 9 });

    expect(await mailboxes.listForSync(account)).toEqual([
      buildMailbox({ unreadCount: 7, totalCount: 9 }),
    ]);
  });

  it('saves, replaces and deletes the sync state of a mailbox', async () => {
    const { mailboxes, syncStates } = store.repositories;
    await mailboxes.upsertMany(account, [buildMailbox()]);
    const state = {
      accountId: account,
      mailboxId: mailboxId('mbx-inbox'),
      uidValidity: 42,
      lastUid: 100,
      highestModseq: '9001',
      initialSyncPending: true,
      syncedAt: '2026-11-10T10:00:00.000Z',
    };

    await syncStates.save(state);
    expect(await syncStates.find(state.mailboxId)).toEqual(state);
    await syncStates.save({ ...state, lastUid: 120, initialSyncPending: false });

    expect(await syncStates.find(state.mailboxId)).toEqual({
      ...state,
      lastUid: 120,
      initialSyncPending: false,
    });
    expect(await syncStates.listByAccount(account)).toHaveLength(1);
    await syncStates.delete(state.mailboxId);
    expect(await syncStates.find(state.mailboxId)).toBeNull();
  });
});

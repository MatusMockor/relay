import { ConflictError, NotFoundError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, buildAccount, mailboxId, userId } from './support/fixtures';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteAccountRepository', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('creates, finds and lists accounts scoped to the user', async () => {
    const { accounts } = store.repositories;
    const first = buildAccount();
    const second = buildAccount({
      id: accountId('acc-2'),
      email: 'jan@osobne.sk',
      createdAt: '2026-11-02T08:00:00.000Z',
    });
    await accounts.create(second);
    await accounts.create(first);
    await accounts.create(buildAccount({ id: accountId('acc-x'), userId: userId('someone-else') }));

    expect(await accounts.listByUser(LOCAL_USER_ID)).toEqual([first, second]);
    expect(await accounts.findById(LOCAL_USER_ID, first.id)).toEqual(first);
    expect(await accounts.findById(LOCAL_USER_ID, accountId('acc-x'))).toBeNull();
  });

  it('finds an account by email case-insensitively and rejects duplicates', async () => {
    const { accounts } = store.repositories;
    await accounts.create(buildAccount());

    expect((await accounts.findByEmail(LOCAL_USER_ID, 'JAN@Firma.sk'))?.id).toBe('acc-1');
    await expect(
      accounts.create(buildAccount({ id: accountId('acc-2'), email: 'Jan@firma.sk' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updates fields and keeps a single primary account', async () => {
    const { accounts } = store.repositories;
    await accounts.create(buildAccount({ isPrimary: true }));
    await accounts.create(buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk' }));

    const updated = await accounts.update(LOCAL_USER_ID, accountId('acc-2'), {
      displayName: 'Osobné',
      isPrimary: true,
    });

    expect(updated).toMatchObject({ displayName: 'Osobné', isPrimary: true });
    expect((await accounts.findById(LOCAL_USER_ID, accountId('acc-1')))?.isPrimary).toBe(false);
    expect(
      await accounts.update(LOCAL_USER_ID, accountId('missing'), { color: '#000000' }),
    ).toBeNull();
    expect(await accounts.update(LOCAL_USER_ID, accountId('acc-2'), {})).toEqual(updated);
  });

  it('stores the sender name apart from the account label', async () => {
    const { accounts } = store.repositories;
    const created = await accounts.create(buildAccount({ senderName: 'Ján Novák' }));

    const cleared = await accounts.update(LOCAL_USER_ID, created.id, { senderName: null });
    const renamed = await accounts.update(LOCAL_USER_ID, created.id, { senderName: 'Ján N.' });

    expect(created).toMatchObject({ displayName: 'Práca', senderName: 'Ján Novák' });
    expect(cleared?.senderName).toBeNull();
    expect(await accounts.findById(LOCAL_USER_ID, created.id)).toEqual(renamed);
    expect(renamed).toMatchObject({ displayName: 'Práca', senderName: 'Ján N.' });
  });

  it('sets the primary account and fails for an unknown account', async () => {
    const { accounts } = store.repositories;
    await accounts.create(buildAccount({ isPrimary: true }));
    await accounts.create(buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk' }));

    await accounts.setPrimary(LOCAL_USER_ID, accountId('acc-2'));

    const primary = (await accounts.listByUser(LOCAL_USER_ID)).filter((item) => item.isPrimary);
    expect(primary.map((item) => item.id)).toEqual(['acc-2']);
    await expect(accounts.setPrimary(LOCAL_USER_ID, accountId('nope'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await accounts.findById(LOCAL_USER_ID, accountId('acc-2')))?.isPrimary).toBe(true);
  });

  it('updates the sync status and lists syncable accounts', async () => {
    const { accounts } = store.repositories;
    await accounts.create(buildAccount());
    await accounts.create(
      buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk', status: 'disconnected' }),
    );

    await accounts.updateStatus(accountId('acc-1'), {
      status: 'error',
      lastError: 'AUTH failed',
      lastSyncedAt: '2026-11-10T12:00:00.000Z',
    });
    await accounts.updateStatus(accountId('acc-1'), { status: 'syncing', lastError: null });

    const stored = await accounts.findById(LOCAL_USER_ID, accountId('acc-1'));
    expect(stored).toMatchObject({
      status: 'syncing',
      lastError: null,
      lastSyncedAt: '2026-11-10T12:00:00.000Z',
    });
    expect((await accounts.listSyncable()).map((item) => item.id)).toEqual(['acc-1']);
  });

  it('deletes an account with its mailboxes', async () => {
    const { accounts, mailboxes } = store.repositories;
    await accounts.create(buildAccount());
    await mailboxes.upsertMany(accountId('acc-1'), [
      {
        id: mailboxId('mbx-1'),
        accountId: accountId('acc-1'),
        name: 'INBOX',
        path: 'INBOX',
        delimiter: '/',
        role: 'inbox',
        subscribed: true,
        uidValidity: null,
        unreadCount: 0,
        totalCount: 0,
      },
    ]);

    expect(await accounts.delete(userId('someone-else'), accountId('acc-1'))).toBe(false);
    expect(await accounts.delete(LOCAL_USER_ID, accountId('acc-1'))).toBe(true);
    expect(await mailboxes.listForSync(accountId('acc-1'))).toEqual([]);
  });
});

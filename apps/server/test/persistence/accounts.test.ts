import { ConflictError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { at, buildAccount, buildUser } from './support/fixtures';
import { openLockHolder, waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

describe('PgAccountRepository', () => {
  const context = usePgTestContext();

  const createUser = () => context.repositories.users.create(buildUser(), 'hash');

  it('creates, lists and finds accounts scoped to the user', async () => {
    const user = await createUser();
    const other = await createUser();
    const first = await context.repositories.accounts.create(
      buildAccount(user.id, { createdAt: at(1) }),
    );
    const second = await context.repositories.accounts.create(
      buildAccount(user.id, { createdAt: at(2), email: 'Eva@Firma.sk' }),
    );
    await context.repositories.accounts.create(buildAccount(other.id));

    await expect(context.repositories.accounts.listByUser(user.id)).resolves.toEqual([
      first,
      second,
    ]);
    await expect(context.repositories.accounts.findById(user.id, first.id)).resolves.toEqual(first);
    await expect(context.repositories.accounts.findById(other.id, first.id)).resolves.toBeNull();
    await expect(
      context.repositories.accounts.findByEmail(user.id, 'eva@firma.SK'),
    ).resolves.toEqual(second);
  });

  it('rejects the same email twice for one user', async () => {
    const user = await createUser();
    const account = await context.repositories.accounts.create(buildAccount(user.id));
    await expect(
      context.repositories.accounts.create(buildAccount(user.id, { email: account.email })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps exactly one primary account', async () => {
    const user = await createUser();
    const first = await context.repositories.accounts.create(
      buildAccount(user.id, { isPrimary: true }),
    );
    const second = await context.repositories.accounts.create(
      buildAccount(user.id, { isPrimary: true, createdAt: at(1) }),
    );
    const primaries = async () =>
      (await context.repositories.accounts.listByUser(user.id))
        .filter((account) => account.isPrimary)
        .map((account) => account.id);

    await expect(primaries()).resolves.toEqual([second.id]);
    await context.repositories.accounts.setPrimary(user.id, first.id);
    await expect(primaries()).resolves.toEqual([first.id]);
  });

  it('keeps the current primary when the target account is deleted while switching', async () => {
    const user = await createUser();
    const primary = await context.repositories.accounts.create(
      buildAccount(user.id, { isPrimary: true }),
    );
    const target = await context.repositories.accounts.create(buildAccount(user.id));
    const deleter = await openLockHolder(context.url);
    await deleter.query('DELETE FROM mail_accounts WHERE id = $1', [target.id]);

    const switching = context.repositories.accounts.update(user.id, target.id, {
      isPrimary: true,
    });
    await waitForLockWaiters(context.url);
    await deleter.commit();

    await expect(switching).resolves.toBeNull();
    await expect(
      context.repositories.accounts.findById(user.id, primary.id),
    ).resolves.toMatchObject({ isPrimary: true });
  });

  it('updates fields and status', async () => {
    const user = await createUser();
    const account = await context.repositories.accounts.create(buildAccount(user.id));
    const updated = await context.repositories.accounts.update(user.id, account.id, {
      displayName: 'Súkromný',
      syncIntervalSeconds: 60,
    });
    expect(updated).toEqual({ ...account, displayName: 'Súkromný', syncIntervalSeconds: 60 });
    await expect(
      context.repositories.accounts.update(buildUser().id, account.id, { displayName: 'X' }),
    ).resolves.toBeNull();
    await expect(
      context.repositories.accounts.update(user.id, account.id, { senderName: null }),
    ).resolves.toMatchObject({ displayName: 'Súkromný', senderName: null });
    await expect(
      context.repositories.accounts.update(user.id, account.id, { senderName: 'Ján N.' }),
    ).resolves.toMatchObject({ displayName: 'Súkromný', senderName: 'Ján N.' });

    await context.repositories.accounts.updateStatus(account.id, {
      status: 'error',
      lastError: 'auth failed',
      lastSyncedAt: at(9),
    });
    await expect(
      context.repositories.accounts.findById(user.id, account.id),
    ).resolves.toMatchObject({
      status: 'error',
      lastError: 'auth failed',
      lastSyncedAt: at(9),
    });
  });

  it('lists syncable accounts across users and deletes only for the owner', async () => {
    const user = await createUser();
    const active = await context.repositories.accounts.create(buildAccount(user.id));
    const disconnected = await context.repositories.accounts.create(
      buildAccount(user.id, { status: 'disconnected' }),
    );
    const syncableIds = (await context.repositories.accounts.listSyncable()).map(
      (account) => account.id,
    );
    expect(syncableIds).toContain(active.id);
    expect(syncableIds).not.toContain(disconnected.id);

    await expect(context.repositories.accounts.delete(buildUser().id, active.id)).resolves.toBe(
      false,
    );
    await expect(context.repositories.accounts.delete(user.id, active.id)).resolves.toBe(true);
    await expect(context.repositories.accounts.findById(user.id, active.id)).resolves.toBeNull();
  });
});

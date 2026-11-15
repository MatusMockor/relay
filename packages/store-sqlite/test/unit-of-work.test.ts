import { ConflictError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { createDeferred, nextTick } from './support/deferred';
import { accountId, buildAccount, buildMailbox } from './support/fixtures';
import { createTestStore, type TestStore } from './support/test-database';

const accountIds = async (store: TestStore): Promise<string[]> =>
  (await store.repositories.accounts.listByUser(LOCAL_USER_ID)).map((account) => account.id);

describe('SqliteUnitOfWork', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('commits every write of a successful unit and returns its result', async () => {
    const result = await store.unitOfWork.run(async (repositories) => {
      const account = await repositories.accounts.create(buildAccount());
      await repositories.mailboxes.upsertMany(account.id, [buildMailbox()]);
      return account.id;
    });

    expect(result).toBe('acc-1');
    expect(await store.repositories.mailboxes.listForSync(accountId('acc-1'))).toHaveLength(1);
  });

  it('rolls back every write when the work fails', async () => {
    const failure = new Error('boom');
    await expect(
      store.unitOfWork.run(async (repositories) => {
        await repositories.accounts.create(buildAccount());
        await nextTick();
        await repositories.mailboxes.upsertMany(accountId('acc-1'), [buildMailbox()]);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await accountIds(store)).toEqual([]);
    expect(store.database.sqlite.inTransaction).toBe(false);
  });

  it('rolls back the whole unit when a repository raises a constraint error', async () => {
    await expect(
      store.unitOfWork.run(async (repositories) => {
        await repositories.accounts.create(buildAccount());
        await repositories.accounts.create(buildAccount({ id: accountId('acc-2') }));
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await accountIds(store)).toEqual([]);
  });

  it('keeps earlier writes when the work recovers from a failed statement', async () => {
    await store.unitOfWork.run(async (repositories) => {
      await repositories.accounts.create(buildAccount());
      await expect(
        repositories.accounts.create(buildAccount({ id: accountId('acc-2') })),
      ).rejects.toBeInstanceOf(ConflictError);
      await repositories.accounts.create(
        buildAccount({ id: accountId('acc-3'), email: 'c@firma.sk' }),
      );
    });

    expect(await accountIds(store)).toEqual(['acc-1', 'acc-3']);
  });

  it('serializes concurrent units so read-modify-write cycles never interleave', async () => {
    await store.repositories.accounts.create(buildAccount({ syncIntervalSeconds: 30 }));
    const increment = () =>
      store.unitOfWork.run(async (repositories) => {
        const current = await repositories.accounts.findById(LOCAL_USER_ID, accountId('acc-1'));
        await nextTick();
        await repositories.accounts.update(LOCAL_USER_ID, accountId('acc-1'), {
          syncIntervalSeconds: (current?.syncIntervalSeconds ?? 0) + 1,
        });
      });

    await Promise.all(Array.from({ length: 10 }, increment));

    const stored = await store.repositories.accounts.findById(LOCAL_USER_ID, accountId('acc-1'));
    expect(stored?.syncIntervalSeconds).toBe(40);
  });

  it('makes plain repository calls wait for an open unit and survive its rollback', async () => {
    const release = createDeferred();
    const order: string[] = [];
    const unit = store.unitOfWork.run(async (repositories) => {
      await repositories.accounts.create(buildAccount());
      await release.promise;
      order.push('unit');
      throw new Error('rollback');
    });
    const outside = store.repositories.accounts
      .create(buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk' }))
      .then(() => {
        order.push('outside');
      });

    await nextTick();
    expect(order).toEqual([]);
    release.resolve();
    await expect(unit).rejects.toThrow('rollback');
    await outside;

    expect(order).toEqual(['unit', 'outside']);
    expect(await accountIds(store)).toEqual(['acc-2']);
  });

  it('continues with queued work after a failed unit', async () => {
    const failing = store.unitOfWork.run(() => Promise.reject(new Error('first')));
    const succeeding = store.unitOfWork.run((repositories) =>
      repositories.accounts.create(buildAccount()),
    );

    await expect(failing).rejects.toThrow('first');
    await expect(succeeding).resolves.toMatchObject({ id: 'acc-1' });
  });

  it('joins nested units and plain repository calls into the open transaction', async () => {
    await expect(
      store.unitOfWork.run(async (repositories) => {
        await repositories.accounts.create(buildAccount());
        await store.unitOfWork.run((nested) =>
          nested.accounts.create(buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk' })),
        );
        await store.repositories.accounts.create(
          buildAccount({ id: accountId('acc-3'), email: 'c@firma.sk' }),
        );
        expect(await repositories.accounts.listByUser(LOCAL_USER_ID)).toHaveLength(3);
        throw new Error('rollback all');
      }),
    ).rejects.toThrow('rollback all');

    expect(await accountIds(store)).toEqual([]);
  });

  it('rejects transaction-bound repositories used after the unit finished', async () => {
    const leaked = await store.unitOfWork.run((repositories) => Promise.resolve(repositories));

    await expect(leaked.accounts.listByUser(LOCAL_USER_ID)).rejects.toThrow(
      'The unit of work has already finished',
    );
  });

  it('refuses writes after SQLite rolled the unit back on its own', async () => {
    store.database.sqlite.exec(
      "CREATE TEMP TRIGGER fail_mailboxes BEFORE INSERT ON mailboxes BEGIN SELECT RAISE(ROLLBACK, 'disk full'); END",
    );
    const later: PromiseSettledResult<unknown>[] = [];

    await expect(
      store.unitOfWork.run(async (repositories) => {
        await repositories.accounts.create(buildAccount());
        await repositories.mailboxes
          .upsertMany(accountId('acc-1'), [buildMailbox()])
          .catch(() => undefined);
        later.push(
          ...(await Promise.allSettled([
            repositories.accounts.create(
              buildAccount({ id: accountId('acc-2'), email: 'second@relay.test' }),
            ),
          ])),
          ...(await Promise.allSettled([
            store.repositories.accounts.create(
              buildAccount({ id: accountId('acc-3'), email: 'third@relay.test' }),
            ),
          ])),
        );
      }),
    ).rejects.toThrow();

    expect(later.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(await accountIds(store)).toEqual([]);
  });
});

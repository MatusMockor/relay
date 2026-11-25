import type { AccountId, UserId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PgUnitOfWork } from '../../src/persistence/unit-of-work/pg-unit-of-work';
import { at, buildAccount, buildUser } from './support/fixtures';
import { openLockHolder, waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

describe('PgAccountRepository account order', () => {
  const context = usePgTestContext();

  const createUser = () => context.repositories.users.create(buildUser(), 'hash');

  const seedThree = async (userId: UserId) => {
    const { accounts } = context.repositories;
    const first = await accounts.create(buildAccount(userId, { createdAt: at(1) }));
    const second = await accounts.create(buildAccount(userId, { createdAt: at(2) }));
    const third = await accounts.create(buildAccount(userId, { createdAt: at(3) }));
    return [first.id, second.id, third.id] as const;
  };

  const ids = async (userId: UserId): Promise<AccountId[]> =>
    (await context.repositories.accounts.listByUser(userId)).map((account) => account.id);

  it('lists accounts in the stored order and appends new ones', async () => {
    const user = await createUser();
    const [first, second, third] = await seedThree(user.id);

    await context.repositories.accounts.reorder(user.id, [third, first, second]);
    const added = await context.repositories.accounts.create(
      buildAccount(user.id, { createdAt: at(0) }),
    );

    await expect(ids(user.id)).resolves.toEqual([third, first, second, added.id]);
  });

  it('lists accounts in the order they were added', async () => {
    const user = await createUser();
    const later = await context.repositories.accounts.create(
      buildAccount(user.id, { createdAt: at(5) }),
    );
    const earlier = await context.repositories.accounts.create(
      buildAccount(user.id, { createdAt: at(1) }),
    );

    await expect(ids(user.id)).resolves.toEqual([later.id, earlier.id]);
  });

  it('never moves the accounts of another user', async () => {
    const user = await createUser();
    const other = await createUser();
    const [first, second, third] = await seedThree(user.id);
    const foreign = await seedThree(other.id);

    await context.repositories.accounts.reorder(user.id, [foreign[2], third, second, first]);

    await expect(ids(user.id)).resolves.toEqual([third, second, first]);
    await expect(ids(other.id)).resolves.toEqual([...foreign]);
  });

  it('writes the order inside a unit of work and rolls it back with the work', async () => {
    const user = await createUser();
    const [first, second, third] = await seedThree(user.id);
    const unitOfWork = new PgUnitOfWork(context.db);

    await unitOfWork.run(async ({ accounts }) => {
      await accounts.reorder(user.id, [second, third, first]);
    });
    await expect(ids(user.id)).resolves.toEqual([second, third, first]);

    await expect(
      unitOfWork.run(async ({ accounts }) => {
        await accounts.reorder(user.id, [first, second, third]);
        return Promise.reject(new Error('stop'));
      }),
    ).rejects.toThrow('stop');
    await expect(ids(user.id)).resolves.toEqual([second, third, first]);
  });

  it('lets two reorders of the same user finish one after the other', async () => {
    const user = await createUser();
    const [first, second, third] = await seedThree(user.id);

    await Promise.all([
      context.repositories.accounts.reorder(user.id, [third, second, first]),
      context.repositories.accounts.reorder(user.id, [second, first, third]),
    ]);

    expect([
      [third, second, first],
      [second, first, third],
    ]).toContainEqual(await ids(user.id));
  });

  it('gives accounts created at the same time their own positions', async () => {
    const user = await createUser();

    await Promise.all(
      [1, 2, 3, 4, 5].map((minute) =>
        context.repositories.accounts.create(buildAccount(user.id, { createdAt: at(minute) })),
      ),
    );

    const positions = await context.db.execute<{ sort_order: number }>(
      sql`select sort_order from mail_accounts where user_id = ${user.id} order by sort_order`,
    );
    expect(positions.rows.map((row) => row.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts only the accounts of the user it moved', async () => {
    const user = await createUser();
    const other = await createUser();
    const [first, second, third] = await seedThree(user.id);
    const [foreign] = await seedThree(other.id);

    await expect(
      context.repositories.accounts.reorder(user.id, [third, foreign, second, first]),
    ).resolves.toBe(3);
  });

  it('reads the accounts for a reorder only after a running delete has finished', async () => {
    const user = await createUser();
    const [first, second, third] = await seedThree(user.id);
    const deleter = await openLockHolder(context.url);
    await deleter.query('DELETE FROM mail_accounts WHERE id = $1', [second]);

    const reading = new PgUnitOfWork(context.db).run(async ({ accounts }) =>
      (await accounts.listByUserForUpdate(user.id)).map((account) => account.id),
    );
    await waitForLockWaiters(context.url);
    await deleter.commit();

    await expect(reading).resolves.toEqual([first, third]);
  });

  it('finishes concurrent reorders, creates and deletes of one user without deadlocks', async () => {
    const user = await createUser();
    const [first, second, third] = await seedThree(user.id);
    const { accounts } = context.repositories;
    const unitOfWork = new PgUnitOfWork(context.db);

    const results = await Promise.allSettled([
      unitOfWork.run(async (repositories) => {
        await repositories.accounts.listByUserForUpdate(user.id);
        return repositories.accounts.reorder(user.id, [third, second, first]);
      }),
      accounts.create(buildAccount(user.id, { createdAt: at(10) })),
      accounts.delete(user.id, second),
      accounts.create(buildAccount(user.id, { createdAt: at(11), isPrimary: true })),
      unitOfWork.run(async (repositories) => {
        await repositories.accounts.listByUserForUpdate(user.id);
        return repositories.accounts.reorder(user.id, [first, third]);
      }),
    ]);

    expect(results.map((result) => result.status)).toEqual(Array(5).fill('fulfilled'));
    const listed = await ids(user.id);
    expect(listed).toHaveLength(4);
    expect(listed).not.toContain(second);
  });
});

import { ConflictError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { PgUnitOfWork } from '../../src/persistence/unit-of-work/pg-unit-of-work';
import { buildAccount, buildDevice, buildUser, defaultSettings } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgUnitOfWork', () => {
  const context = usePgTestContext();

  it('commits every write of the work together', async () => {
    const unitOfWork = new PgUnitOfWork(context.db);
    const user = buildUser();
    const device = buildDevice(user.id);

    const result = await unitOfWork.run(async (repositories) => {
      await repositories.users.create(user, 'hash');
      await repositories.devices.create(device);
      await repositories.settings.save(user.id, defaultSettings());
      return repositories.accounts.create(buildAccount(user.id));
    });

    await expect(context.repositories.users.findById(user.id)).resolves.toEqual(user);
    await expect(context.repositories.devices.listForUser(user.id)).resolves.toEqual([device]);
    await expect(context.repositories.accounts.listByUser(user.id)).resolves.toEqual([result]);
  });

  it('rolls back everything when the work fails', async () => {
    const unitOfWork = new PgUnitOfWork(context.db);
    const existing = await context.repositories.users.create(buildUser(), 'hash');
    const user = buildUser();

    await expect(
      unitOfWork.run(async (repositories) => {
        await repositories.users.create(user, 'hash');
        await repositories.settings.save(user.id, defaultSettings());
        await repositories.users.create(buildUser({ email: existing.email }), 'hash');
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(context.repositories.users.findById(user.id)).resolves.toBeNull();
    await expect(context.repositories.settings.find(user.id)).resolves.toBeNull();
  });

  it('sees its own uncommitted writes and hides them from others until commit', async () => {
    const unitOfWork = new PgUnitOfWork(context.db);
    const user = buildUser();

    await unitOfWork.run(async (repositories) => {
      await repositories.users.create(user, 'hash');
      await expect(repositories.users.findById(user.id)).resolves.toEqual(user);
      await expect(context.repositories.users.findById(user.id)).resolves.toBeNull();
    });

    await expect(context.repositories.users.findById(user.id)).resolves.toEqual(user);
  });

  it('rolls back nested repository transactions with the outer one', async () => {
    const unitOfWork = new PgUnitOfWork(context.db);
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const account = buildAccount(user.id);

    await expect(
      unitOfWork.run(async (repositories) => {
        await repositories.accounts.create(account);
        await repositories.accounts.create(buildAccount(user.id, { email: account.email }));
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(context.repositories.accounts.listByUser(user.id)).resolves.toEqual([]);
  });
});

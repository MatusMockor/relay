import { ConflictError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { at, buildDevice, buildUser } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgUserRepository', () => {
  const context = usePgTestContext();

  it('creates a user and finds it by id and case-insensitive email', async () => {
    const user = buildUser({ email: 'Jan.Novak@Relay.test' });
    await expect(context.repositories.users.create(user, 'argon-hash')).resolves.toEqual(user);
    await expect(context.repositories.users.findById(user.id)).resolves.toEqual(user);
    await expect(context.repositories.users.findByEmail('jan.novak@relay.TEST')).resolves.toEqual({
      user,
      passwordHash: 'argon-hash',
    });
  });

  it('rejects a duplicate email with a conflict', async () => {
    const user = buildUser();
    await context.repositories.users.create(user, 'hash');
    await expect(
      context.repositories.users.create(buildUser({ email: user.email.toUpperCase() }), 'hash'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns null for unknown users', async () => {
    await expect(context.repositories.users.findByEmail('nobody@relay.test')).resolves.toBeNull();
    await expect(context.repositories.users.findById(buildUser().id)).resolves.toBeNull();
  });
});

describe('PgDeviceRepository', () => {
  const context = usePgTestContext();

  it('lists active devices of the owner, newest activity first', async () => {
    const owner = await context.repositories.users.create(buildUser(), 'hash');
    const other = await context.repositories.users.create(buildUser(), 'hash');
    const laptop = await context.repositories.devices.create(
      buildDevice(owner.id, { lastSeenAt: at(1) }),
    );
    const desktop = await context.repositories.devices.create(
      buildDevice(owner.id, { name: 'Linux', platform: 'linux', lastSeenAt: at(5) }),
    );
    await context.repositories.devices.create(buildDevice(other.id));

    await expect(context.repositories.devices.listForUser(owner.id)).resolves.toEqual([
      desktop,
      laptop,
    ]);
  });

  it('touches and revokes a device only for its owner', async () => {
    const owner = await context.repositories.users.create(buildUser(), 'hash');
    const intruder = await context.repositories.users.create(buildUser(), 'hash');
    const device = await context.repositories.devices.create(buildDevice(owner.id));

    await context.repositories.devices.touch(device.id, at(30));
    await expect(context.repositories.devices.findActive(owner.id, device.id)).resolves.toEqual({
      ...device,
      lastSeenAt: at(30),
    });
    await expect(
      context.repositories.devices.findActive(intruder.id, device.id),
    ).resolves.toBeNull();

    await expect(context.repositories.devices.revoke(intruder.id, device.id, at(31))).resolves.toBe(
      false,
    );
    await expect(context.repositories.devices.revoke(owner.id, device.id, at(31))).resolves.toBe(
      true,
    );
    await expect(context.repositories.devices.revoke(owner.id, device.id, at(32))).resolves.toBe(
      false,
    );
    await expect(context.repositories.devices.findActive(owner.id, device.id)).resolves.toBeNull();
    await expect(context.repositories.devices.listForUser(owner.id)).resolves.toEqual([]);
  });
});

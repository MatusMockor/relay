import { randomBytes } from 'node:crypto';
import type { Split, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { NewRefreshToken } from '../../src/core/model/refresh-token';
import { at, buildAccount, buildDevice, buildUser, newId } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const ROUNDS = 15;

describe('concurrent writes', () => {
  const context = usePgTestContext();

  it('never leaves a valid token when a family is revoked during rotation', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    for (let round = 0; round < ROUNDS; round += 1) {
      const device = await context.repositories.devices.create(buildDevice(user.id));
      const token = (): NewRefreshToken => ({
        id: randomBytes(8).toString('hex'),
        userId: user.id,
        deviceId: device.id,
        familyId: device.id,
        tokenHash: randomBytes(16).toString('hex'),
        expiresAt: at(1_000),
        createdAt: at(0),
      });
      const current = await context.repositories.refreshTokens.store(token());
      const next = token();

      await Promise.all([
        context.repositories.refreshTokens.rotate(current.id, next, at(1)),
        context.repositories.refreshTokens.revokeFamily(device.id, at(1)),
      ]);

      await expect(
        context.repositories.refreshTokens.findValid(next.tokenHash, at(2)),
      ).resolves.toBeNull();
      await expect(
        context.repositories.refreshTokens.findValid(current.tokenHash, at(2)),
      ).resolves.toBeNull();
    }
  });

  it('replaces splits as a whole when two replacements race', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const split = (userId: UserId, name: string): Split => ({
      id: newId('split'),
      userId,
      accountId: null,
      name,
      order: 0,
      rules: [{ type: 'fromDomain', domain: `${name}.sk` }],
      exclusive: false,
      hideTasks: false,
    });
    for (let round = 0; round < ROUNDS; round += 1) {
      const left = [split(user.id, 'a')];
      const right = [split(user.id, 'b')];
      await Promise.all([
        context.repositories.splits.replaceAll(user.id, left),
        context.repositories.splits.replaceAll(user.id, right),
      ]);
      const names = (await context.repositories.splits.listByUser(user.id)).map((item) => item.id);
      expect([[left[0]?.id], [right[0]?.id]]).toContainEqual(names);
    }
  });

  it('switches the primary account safely under concurrency', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const first = await context.repositories.accounts.create(
      buildAccount(user.id, { isPrimary: true }),
    );
    const second = await context.repositories.accounts.create(buildAccount(user.id));
    const third = await context.repositories.accounts.create(buildAccount(user.id));

    for (let round = 0; round < ROUNDS; round += 1) {
      await Promise.all([
        context.repositories.accounts.setPrimary(user.id, second.id),
        context.repositories.accounts.setPrimary(user.id, third.id),
        context.repositories.accounts.create(buildAccount(user.id, { isPrimary: true })),
      ]);
      const primaries = (await context.repositories.accounts.listByUser(user.id)).filter(
        (account) => account.isPrimary,
      );
      expect(primaries).toHaveLength(1);
    }
    expect(first.isPrimary).toBe(true);
  });
});

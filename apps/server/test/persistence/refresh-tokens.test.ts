import { randomBytes } from 'node:crypto';
import type { Device, User } from '@relay/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewRefreshToken } from '../../src/core/model/refresh-token';
import { at, buildDevice, buildUser } from './support/fixtures';
import { openLockHolder, waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

describe('PgRefreshTokenRepository', () => {
  const context = usePgTestContext();
  let user: User;
  let device: Device;

  const buildToken = (overrides: Partial<NewRefreshToken> = {}): NewRefreshToken => ({
    id: randomBytes(8).toString('hex'),
    userId: user.id,
    deviceId: device.id,
    familyId: device.id,
    tokenHash: randomBytes(32).toString('hex'),
    expiresAt: at(60 * 24),
    createdAt: at(0),
    ...overrides,
  });

  beforeEach(async () => {
    user = await context.repositories.users.create(buildUser(), 'hash');
    device = await context.repositories.devices.create(buildDevice(user.id));
  });

  it('stores a hashed token and finds it while valid', async () => {
    const token = buildToken();
    const stored = await context.repositories.refreshTokens.store(token);
    expect(stored).toEqual({ ...token, rotatedAt: null, revokedAt: null });
    await expect(
      context.repositories.refreshTokens.findValid(token.tokenHash, at(1)),
    ).resolves.toEqual(stored);
    await expect(
      context.repositories.refreshTokens.findValid(token.tokenHash, at(60 * 25)),
    ).resolves.toBeNull();
  });

  it('rotates exactly once and keeps the old token visible for reuse detection', async () => {
    const current = await context.repositories.refreshTokens.store(buildToken());
    const next = buildToken({ createdAt: at(5) });

    const rotated = await context.repositories.refreshTokens.rotate(current.id, next, at(5));
    expect(rotated).toEqual({ ...next, rotatedAt: null, revokedAt: null });
    await expect(
      context.repositories.refreshTokens.rotate(current.id, buildToken(), at(6)),
    ).resolves.toBeNull();

    await expect(
      context.repositories.refreshTokens.findValid(current.tokenHash, at(6)),
    ).resolves.toBeNull();
    await expect(
      context.repositories.refreshTokens.findByHash(current.tokenHash),
    ).resolves.toMatchObject({ id: current.id, rotatedAt: at(5), revokedAt: null });
    await expect(
      context.repositories.refreshTokens.findValid(next.tokenHash, at(6)),
    ).resolves.toEqual(rotated);
  });

  it('allows only one of two concurrent rotations', async () => {
    const current = await context.repositories.refreshTokens.store(buildToken());
    const results = await Promise.all([
      context.repositories.refreshTokens.rotate(current.id, buildToken(), at(1)),
      context.repositories.refreshTokens.rotate(current.id, buildToken(), at(1)),
    ]);
    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('revokes a whole family', async () => {
    const first = await context.repositories.refreshTokens.store(buildToken());
    const second = await context.repositories.refreshTokens.store(buildToken());
    const otherDevice = await context.repositories.devices.create(buildDevice(user.id));
    const unrelated = await context.repositories.refreshTokens.store(
      buildToken({ deviceId: otherDevice.id, familyId: otherDevice.id }),
    );

    await context.repositories.refreshTokens.revokeFamily(device.id, at(2));

    await expect(
      context.repositories.refreshTokens.findValid(first.tokenHash, at(3)),
    ).resolves.toBeNull();
    await expect(
      context.repositories.refreshTokens.findValid(second.tokenHash, at(3)),
    ).resolves.toBeNull();
    await expect(
      context.repositories.refreshTokens.findValid(unrelated.tokenHash, at(3)),
    ).resolves.toEqual(unrelated);
    await expect(
      context.repositories.refreshTokens.rotate(first.id, buildToken(), at(4)),
    ).resolves.toBeNull();
  });

  it('treats tokens of a revoked device as invalid', async () => {
    const token = await context.repositories.refreshTokens.store(buildToken());
    await context.repositories.devices.revoke(user.id, device.id, at(1));
    await expect(
      context.repositories.refreshTokens.findValid(token.tokenHash, at(2)),
    ).resolves.toBeNull();

    await context.repositories.refreshTokens.revokeDevice(device.id, at(2));
    await expect(
      context.repositories.refreshTokens.findByHash(token.tokenHash),
    ).resolves.toMatchObject({ revokedAt: at(2) });
  });

  it('revokes the device itself together with its tokens', async () => {
    const token = await context.repositories.refreshTokens.store(buildToken());

    await context.repositories.refreshTokens.revokeDevice(device.id, at(2));

    await expect(context.repositories.devices.findActive(user.id, device.id)).resolves.toBeNull();
    await expect(
      context.repositories.refreshTokens.findByHash(token.tokenHash),
    ).resolves.toMatchObject({ revokedAt: at(2) });
  });

  it('refuses to rotate a token of a revoked device', async () => {
    const current = await context.repositories.refreshTokens.store(buildToken());
    await context.repositories.devices.revoke(user.id, device.id, at(1));
    const next = buildToken();

    await expect(
      context.repositories.refreshTokens.rotate(current.id, next, at(2)),
    ).resolves.toBeNull();
    await expect(context.repositories.refreshTokens.findByHash(next.tokenHash)).resolves.toBeNull();
  });

  it('does not rotate while a device revocation is being committed', async () => {
    const current = await context.repositories.refreshTokens.store(buildToken());
    const revoker = await openLockHolder(context.url);
    await revoker.query('UPDATE devices SET revoked_at = $2 WHERE id = $1', [device.id, at(1)]);
    const next = buildToken();

    const rotating = context.repositories.refreshTokens.rotate(current.id, next, at(2));
    await waitForLockWaiters(context.url);
    await revoker.commit();

    await expect(rotating).resolves.toBeNull();
    await expect(context.repositories.refreshTokens.findByHash(next.tokenHash)).resolves.toBeNull();
  });

  it('revokes a successor that a concurrent rotation commits', async () => {
    const successor = buildToken();
    const rotator = await openLockHolder(context.url);
    await rotator.query('SELECT 1 FROM devices WHERE id = $1 FOR SHARE', [device.id]);
    await rotator.query(
      `INSERT INTO refresh_tokens (id, user_id, device_id, family_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        successor.id,
        successor.userId,
        successor.deviceId,
        successor.familyId,
        successor.tokenHash,
        successor.expiresAt,
        successor.createdAt,
      ],
    );

    const revoking = context.repositories.refreshTokens.revokeDevice(device.id, at(3));
    await waitForLockWaiters(context.url);
    await rotator.commit();
    await revoking;

    await expect(
      context.repositories.refreshTokens.findByHash(successor.tokenHash),
    ).resolves.toMatchObject({ revokedAt: at(3) });
  });
});

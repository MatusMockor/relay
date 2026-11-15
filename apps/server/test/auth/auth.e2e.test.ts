import { randomUUID } from 'node:crypto';
import { api, ApiErrorResponseSchema } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loginUser, registerUser, TEST_PASSWORD } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const uniqueEmail = (): string => `user-${randomUUID().slice(0, 8)}@relay.test`;

describe('auth and devices', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in on a second device, rotates refresh tokens and detects reuse', async () => {
    const email = uniqueEmail();
    const first = await registerUser(app.api, email.toUpperCase());
    expect(first.user.email).toBe(email);
    expect(first.device).toMatchObject({ name: 'MacBook', platform: 'macos' });

    const me = await app.api.ok(api.auth.me, {}, first.accessToken);
    expect(me).toEqual({ user: first.user, device: first.device });

    const duplicate = await app.api.fail(api.auth.register, {
      body: { email, password: TEST_PASSWORD, displayName: 'x', device: first.device },
    });
    expect(duplicate).toMatchObject({ status: 409, error: { code: 'conflict' } });

    const wrong = await app.api.fail(api.auth.login, {
      body: { email, password: 'nope-nope', device: { name: 'x', platform: 'linux' } },
    });
    expect(wrong).toMatchObject({ status: 401, error: { code: 'unauthorized' } });

    const second = await loginUser(app.api, email);
    expect(second.user.id).toBe(first.user.id);
    expect(second.device.id).not.toBe(first.device.id);

    const devices = await app.api.ok(api.devices.list, {}, first.accessToken);
    expect(devices.map((device) => [device.id, device.current]).sort()).toEqual(
      [
        [first.device.id, true],
        [second.device.id, false],
      ].sort(),
    );

    const rotated = await app.api.ok(api.auth.refresh, {
      body: { refreshToken: first.refreshToken },
    });
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    const rotatedAgain = await app.api.ok(api.auth.refresh, {
      body: { refreshToken: rotated.refreshToken },
    });
    await app.api.ok(api.auth.me, {}, rotatedAgain.accessToken);

    const reuse = await app.api.fail(api.auth.refresh, {
      body: { refreshToken: first.refreshToken },
    });
    expect(reuse).toMatchObject({ status: 401, error: { code: 'unauthorized' } });

    const familyRevoked = await app.api.fail(api.auth.refresh, {
      body: { refreshToken: rotatedAgain.refreshToken },
    });
    expect(familyRevoked.status).toBe(401);
    const accessRevoked = await app.api.fail(api.auth.me, {}, rotatedAgain.accessToken);
    expect(accessRevoked.status).toBe(401);

    await app.api.ok(api.auth.me, {}, second.accessToken);
    const remaining = await app.api.ok(api.devices.list, {}, second.accessToken);
    expect(remaining.map((device) => device.id)).toEqual([second.device.id]);
  });

  it('revokes another device and logs out the current one', async () => {
    const email = uniqueEmail();
    const laptop = await registerUser(app.api, email);
    const desktop = await loginUser(app.api, email);

    await app.api.ok(api.devices.revoke, { params: { id: desktop.device.id } }, laptop.accessToken);
    expect((await app.api.fail(api.auth.me, {}, desktop.accessToken)).status).toBe(401);
    const refresh = await app.api.fail(api.auth.refresh, {
      body: { refreshToken: desktop.refreshToken },
    });
    expect(refresh.status).toBe(401);

    const missing = await app.api.fail(
      api.devices.revoke,
      { params: { id: desktop.device.id } },
      laptop.accessToken,
    );
    expect(missing).toMatchObject({ status: 404, error: { code: 'not_found' } });

    await app.api.ok(api.auth.logout, {}, laptop.accessToken);
    expect((await app.api.fail(api.auth.me, {}, laptop.accessToken)).status).toBe(401);
  });

  it('expires access tokens after 15 minutes of clock time', async () => {
    const session = await registerUser(app.api, uniqueEmail());
    app.clock.advance(14 * 60_000);
    await app.api.ok(api.auth.me, {}, session.accessToken);
    app.clock.advance(2 * 60_000);
    expect((await app.api.fail(api.auth.me, {}, session.accessToken)).status).toBe(401);
    const pair = await app.api.ok(api.auth.refresh, {
      body: { refreshToken: session.refreshToken },
    });
    await app.api.ok(api.auth.me, {}, pair.accessToken);
  });

  it('rejects missing tokens and invalid bodies with the shared error shape', async () => {
    expect(await app.api.fail(api.devices.list, {})).toMatchObject({
      status: 401,
      error: { code: 'unauthorized' },
    });
    const invalid = await app.api.raw(api.auth.register, {
      body: {
        email: 'not-an-email',
        password: 'short',
        displayName: '',
        device: { name: 'x', platform: 'macos' },
      },
    });
    expect(invalid.status).toBe(400);
    const parsed = ApiErrorResponseSchema.parse(invalid.body);
    expect(parsed.error.code).toBe('validation_failed');
    expect(parsed.error.issues?.map((issue) => issue.path)).toContain('email');
  });
});

describe('closed registration', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { REGISTRATION_ENABLED: 'false' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses new users with 403', async () => {
    const failure = await app.api.fail(api.auth.register, {
      body: {
        email: uniqueEmail(),
        password: TEST_PASSWORD,
        displayName: 'Nobody',
        device: { name: 'x', platform: 'linux' },
      },
    });
    expect(failure).toMatchObject({ status: 403, error: { code: 'forbidden' } });
  });
});

import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const uniqueEmail = (): string => `rl-${randomUUID().slice(0, 8)}@relay.test`;

describe('auth rate limits', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({
      env: { AUTH_RATE_LIMIT_MAX: '3', AUTH_RATE_LIMIT_WINDOW_SECONDS: '60' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const wrongLogin = (email: string, forwardedFor?: string) =>
    fetch(`${app.baseUrl}${api.auth.login.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }),
      },
      body: JSON.stringify({
        email,
        password: 'wrong password entirely',
        device: { name: 'Laptop', platform: 'linux' },
      }),
    });

  it('limits password guesses per client and per account until the window ends', async () => {
    const email = uniqueEmail();
    await registerUser(app.api, email);

    const statuses: number[] = [];
    for (const attempt of [1, 2, 3, 4]) {
      statuses.push((await wrongLogin(email, `198.51.100.${String(attempt)}`)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
    expect((await wrongLogin(uniqueEmail(), '198.51.100.1')).status).toBe(401);

    const limited = await wrongLogin(uniqueEmail(), '203.0.113.9');
    expect(limited.status).toBe(401);
    for (const _ of [1, 2]) {
      await wrongLogin(uniqueEmail(), '203.0.113.9');
    }
    const blocked = await wrongLogin(uniqueEmail(), '203.0.113.9');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many attempts, try again later' },
    });

    app.clock.advance(60_000);
    expect((await wrongLogin(email, '203.0.113.9')).status).toBe(401);
  });

  it('keys the client limit on the address the proxy added, not on spoofed entries', async () => {
    const statuses: number[] = [];
    for (const attempt of [1, 2, 3, 4]) {
      const spoofed = `192.0.2.${String(attempt)}, 198.51.100.200`;
      statuses.push((await wrongLogin(uniqueEmail(), spoofed)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
    expect((await wrongLogin(uniqueEmail(), '192.0.2.1, 198.51.100.201')).status).toBe(401);
  });

  it('limits refresh attempts per client', async () => {
    const statuses: number[] = [];
    for (const _ of [1, 2, 3, 4]) {
      const response = await app.api.raw(api.auth.refresh, {
        body: { refreshToken: 'x'.repeat(64) },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 3).every((status) => status !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
  });
});

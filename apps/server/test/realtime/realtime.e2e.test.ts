import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { api, API_VERSION } from '@relay/shared/api';
import { AccountIdSchema, type UserId } from '@relay/shared/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PORT_TOKENS, type EventPublisher } from '@relay/engine';
import {
  ACCESS_TOKEN_AUTHENTICATOR,
  type AccessTokenAuthenticator,
} from '../../src/auth/session/access-token-authenticator';
import { loginUser, registerUser } from '../support/auth-flow';
import { authenticateRealtime, connectRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const uniqueEmail = (): string => `rt-${randomUUID().slice(0, 8)}@relay.test`;

describe('realtime gateway', () => {
  let app: TestApp;
  let publisher: EventPublisher;

  beforeAll(async () => {
    app = await startTestApp();
    publisher = app.app.get<EventPublisher>(PORT_TOKENS.EventPublisher);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const publishAccountRemoved = (userId: UserId, accountId = 'acc_x') =>
    publisher.publish(userId, {
      type: 'account.removed',
      at: app.clock.now().toISOString(),
      data: { accountId: AccountIdSchema.parse(accountId) },
    });

  const rawUpgrade = (path: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const { port } = new URL(app.baseUrl);
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write(
          [
            `GET ${path} HTTP/1.1`,
            'Host: 127.0.0.1',
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version: 13',
            '',
            '',
          ].join('\r\n'),
        );
      });
      socket.on('error', reject);
      socket.on('close', () => {
        resolve();
      });
    });

  it('authenticates with hello, answers pings and fans out events per user', async () => {
    const alice = await registerUser(app.api, uniqueEmail());
    const bob = await registerUser(app.api, uniqueEmail());
    const aliceSocket = await authenticateRealtime(app.baseUrl, alice.accessToken);
    const bobSocket = await authenticateRealtime(app.baseUrl, bob.accessToken);

    expect(aliceSocket.messages[0]).toEqual({
      type: 'welcome',
      userId: alice.user.id,
      deviceId: alice.device.id,
    });

    aliceSocket.send({ type: 'ping', nonce: 'n-1' });
    await aliceSocket.waitFor((message) => message.type === 'pong' && message.nonce === 'n-1');

    await publishAccountRemoved(alice.user.id);
    const event = await aliceSocket.waitFor((message) => message.type === 'event');
    expect(event).toMatchObject({ type: 'event', event: { type: 'account.removed' } });
    await publishAccountRemoved(bob.user.id, 'acc_bob_marker');
    await bobSocket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'account.removed' &&
        message.event.data.accountId === 'acc_bob_marker',
    );
    expect(bobSocket.messages.filter((message) => message.type === 'event')).toHaveLength(1);

    aliceSocket.close();
    bobSocket.close();
  });

  it('rejects an invalid token and a missing hello', async () => {
    const socket = await connectRealtime(app.baseUrl);
    socket.send({ type: 'hello', apiVersion: API_VERSION, accessToken: 'garbage' });
    await socket.waitFor((message) => message.type === 'error' && message.code === 'unauthorized');
    expect(await socket.closed).toBe(1008);

    const silent = await connectRealtime(app.baseUrl);
    silent.send({ type: 'nonsense' });
    await silent.waitFor((message) => message.type === 'error');
    expect(await silent.closed).toBe(1008);
  });

  it('survives oversized frames from unauthenticated clients', async () => {
    const socket = await connectRealtime(app.baseUrl);
    socket.send({ type: 'hello', apiVersion: API_VERSION, accessToken: 'x'.repeat(128 * 1024) });
    expect(await socket.closed).toBe(1009);
    expect(await app.api.ok(api.health.get, {})).toMatchObject({ name: 'relay' });
  });

  it('closes the connections of a revoked device', async () => {
    const email = uniqueEmail();
    const laptop = await registerUser(app.api, email);
    const desktop = await loginUser(app.api, email);
    const socket = await authenticateRealtime(app.baseUrl, desktop.accessToken);

    await app.api.ok(api.devices.revoke, { params: { id: desktop.device.id } }, laptop.accessToken);
    expect(await socket.closed).toBe(1008);
  });

  it('survives an upgrade request whose URL cannot be parsed', async () => {
    await rawUpgrade('//');
    expect(await app.api.ok(api.health.get, {})).toMatchObject({ name: 'relay' });
  });

  it('rejects a hello whose device is revoked while it authenticates', async () => {
    const email = uniqueEmail();
    const laptop = await registerUser(app.api, email);
    const desktop = await loginUser(app.api, email);
    const authenticator = app.app.get<AccessTokenAuthenticator>(ACCESS_TOKEN_AUTHENTICATOR);
    const authenticate = authenticator.authenticate.bind(authenticator);
    vi.spyOn(authenticator, 'authenticate').mockImplementationOnce(async (token) => {
      const principal = await authenticate(token);
      await app.api.ok(
        api.devices.revoke,
        { params: { id: desktop.device.id } },
        laptop.accessToken,
      );
      return principal;
    });

    const socket = await connectRealtime(app.baseUrl);
    socket.send({ type: 'hello', apiVersion: API_VERSION, accessToken: desktop.accessToken });

    await socket.waitFor((message) => message.type === 'error' && message.code === 'unauthorized');
    expect(await socket.closed).toBe(1008);
    expect(socket.messages.some((message) => message.type === 'welcome')).toBe(false);
  });
});

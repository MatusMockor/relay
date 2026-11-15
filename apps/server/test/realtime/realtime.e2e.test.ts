import { randomUUID } from 'node:crypto';
import { api, API_VERSION } from '@relay/shared/api';
import { AccountIdSchema, type UserId } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PORT_TOKENS, type EventPublisher } from '@relay/engine';
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

  const publishAccountRemoved = (userId: UserId) =>
    publisher.publish(userId, {
      type: 'account.removed',
      at: app.clock.now().toISOString(),
      data: { accountId: AccountIdSchema.parse('acc_x') },
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
    expect(bobSocket.messages.some((message) => message.type === 'event')).toBe(false);

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
});

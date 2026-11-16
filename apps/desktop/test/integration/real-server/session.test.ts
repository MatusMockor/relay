import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TokenRefreshRequest } from '../../../src/main/ai/remote/token-refresh-request';
import { checkServerHealth } from '../../../src/renderer/src/data/remote/ServerApi';
import { type RelayServer, SERVER_HOOK_TIMEOUT_MS, startRelayServer } from './support/relay-server';
import { startSyncedDesktop, type SyncedDesktop, uniqueEmail } from './support/synced-desktop';

const FIFTEEN_MINUTES = 15 * 60_000;

describe('synced desktop session against the real server', () => {
  let server: RelayServer | null = null;
  const desktops: SyncedDesktop[] = [];

  beforeAll(async () => {
    server = await startRelayServer();
  }, SERVER_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(desktops.splice(0).map((desktop) => desktop.close()));
  });

  afterAll(async () => {
    await server?.close();
  }, SERVER_HOOK_TIMEOUT_MS);

  const serverUrl = (): string => server?.url ?? '';

  const desktop = async (): Promise<SyncedDesktop> => {
    const started = await startSyncedDesktop(serverUrl());
    desktops.push(started);
    return started;
  };

  it('registers through the main process and calls the API with the stored session', async () => {
    const laptop = await desktop();
    expect(await checkServerHealth(serverUrl())).toMatchObject({ name: 'relay', apiVersion: 1 });
    const email = uniqueEmail('session');

    const session = await laptop.register(email);

    expect(await laptop.api.server.hasSession()).toBe(true);
    expect((await laptop.storedTokens())?.refreshToken).toBe(session.refreshToken);
    expect(await laptop.api.server.me()).toEqual({ user: session.user, device: session.device });
    expect(await laptop.openClient().listAccounts()).toEqual([]);

    const workstation = await desktop();
    const second = await workstation.login(email, 'Pracovná stanica');
    expect(second.user.id).toBe(session.user.id);
    const devices = await laptop.api.server.listDevices();
    expect(devices.map((device) => [device.name, device.current]).sort()).toEqual([
      ['Pracovná stanica', false],
      ['Relay test desktop', true],
    ]);
  });

  it('rotates the refresh token ahead of expiry and ends the session after a reuse', async () => {
    const laptop = await desktop();
    await laptop.register(uniqueEmail('rotate'));
    const original = await laptop.storedTokens();
    expect(original).not.toBeNull();

    laptop.clock.shift(FIFTEEN_MINUTES);
    await laptop.api.server.me();
    laptop.clock.shift(0);

    const rotated = await laptop.storedTokens();
    expect(rotated?.refreshToken).not.toBe(original?.refreshToken);
    await laptop.api.server.me();
    expect((await laptop.storedTokens())?.refreshToken).toBe(rotated?.refreshToken);

    const replay = await new TokenRefreshRequest(serverUrl()).send(original?.refreshToken ?? '');
    expect(replay).toEqual({ kind: 'rejected' });

    await expect(laptop.api.server.me()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(laptop.expiredSessions()).toBe(1);
    expect(await laptop.storedTokens()).toBeNull();
    expect(await laptop.api.server.hasSession()).toBe(false);
  });

  it('signs the desktop out when another device revokes it', async () => {
    const laptop = await desktop();
    const email = uniqueEmail('revoke');
    const session = await laptop.register(email);
    laptop.openClient();
    await expect.poll(() => laptop.realtime.at(-1), { timeout: 10_000 }).toBe('online');

    const phone = await desktop();
    await phone.login(email, 'Druhý počítač');
    await phone.api.server.revokeDevice(session.device.id);

    await expect.poll(() => laptop.expiredSessions(), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await laptop.storedTokens()).toBeNull();
    expect(laptop.realtime.at(-1)).not.toBe('online');
    await expect(laptop.api.server.me()).rejects.toMatchObject({ code: 'unauthorized' });
    const remaining = await phone.api.server.listDevices();
    expect(remaining.map((device) => device.name)).toEqual(['Druhý počítač']);
  });

  it('logs out on the server and forgets the tokens in the main process', async () => {
    const laptop = await desktop();
    const email = uniqueEmail('logout');
    await laptop.register(email);
    const phone = await desktop();
    await phone.login(email, 'Druhý počítač');

    await laptop.api.server.logout();

    expect(await laptop.api.server.hasSession()).toBe(false);
    expect(await laptop.sessions.get(serverUrl()).accessToken()).toBeNull();
    const remaining = await phone.api.server.listDevices();
    expect(remaining.map((device) => device.name)).toEqual(['Druhý počítač']);
  });
});

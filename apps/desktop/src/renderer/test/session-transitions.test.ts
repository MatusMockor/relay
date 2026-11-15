// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import type { TokenStore } from '../src/data/remote/TokenStore';
import { type BrowserPlatform, createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { useSessionStore } from '../src/session/session-store';
import { SessionController } from '../src/session/SessionController';
import { type ContractServer, startContractServer } from './support/contract-server';
import { session, tokens } from './support/fixtures';
import { type Gate, gate } from './support/gate';
import { memoryStorage, resetStores } from './support/render-app';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const heldLoads = (store: TokenStore, held: Gate): TokenStore => ({
  load: async () => {
    await held.wait();
    return store.load();
  },
  save: (pair) => store.save(pair),
  clear: () => store.clear(),
});

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await pause(10);
  }
  expect(check()).toBe(true);
};

const UNAUTHORIZED = { error: { code: 'unauthorized', message: 'Neplatný token' } };

describe('session transitions between servers', () => {
  let first: ContractServer;
  let second: ContractServer;
  let controller: SessionController | null = null;

  beforeEach(async () => {
    resetStores();
    first = await startContractServer();
    second = await startContractServer();
  });

  afterEach(async () => {
    controller?.dispose();
    controller = null;
    resetStores();
    await first.close();
    await second.close();
  });

  const platformWith = async (
    held: { readonly url: string; readonly gate: Gate } | null,
  ): Promise<BrowserPlatform> => {
    const base = createBrowserPlatform(memoryStorage());
    await base.tokenStore(first.url).save(tokens('access-first'));
    await base.tokenStore(second.url).save(tokens('access-second'));
    return {
      ...base,
      serverSession: (serverUrl, hooks) =>
        new RendererTokenSession({
          ...hooks,
          baseUrl: serverUrl,
          tokens:
            serverUrl === held?.url
              ? heldLoads(base.tokenStore(serverUrl), held.gate)
              : base.tokenStore(serverUrl),
        }),
    };
  };

  it('keeps the server that was picked last when an older switch finishes later', async () => {
    const firstLoad = gate();
    const platform = await platformWith({ url: first.url, gate: firstLoad });
    controller = new SessionController(platform, useSessionStore);
    const older = controller.switchServer(first.url);
    await controller.switchServer(second.url);
    firstLoad.open();
    await older;
    expect(useSessionStore.getState().services?.serverUrl).toBe(second.url);
    expect((await platform.deviceSettings()).activeServerUrl).toBe(second.url);
  });

  it('drops a login that finishes after the user left the server step', async () => {
    first.handle('auth.login', () => ({ body: session('access-login') }));
    const base = await platformWith(null);
    const remembering = gate();
    let remembered = false;
    const platform: BrowserPlatform = {
      ...base,
      updateDeviceSettings: async (patch) => {
        remembered = true;
        await remembering.wait();
        return base.updateDeviceSettings(patch);
      },
    };
    controller = new SessionController(platform, useSessionStore);
    await controller.verifyServer(first.url);
    const login = controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo123' });
    await waitUntil(() => remembered);
    controller.goTo('welcome', null);
    remembering.open();
    await login;
    const state = useSessionStore.getState();
    expect(state.phase).toBe('onboarding');
    expect(state.step).toBe('welcome');
    expect(state.services).toBeNull();
  });

  it('ignores a session expiry reported by a server that is no longer active', async () => {
    const me = gate();
    first.handle('auth.me', () => ({ status: 401, holdUntil: me.wait(), body: UNAUTHORIZED }));
    first.handle('auth.refresh', () => ({ status: 401, body: UNAUTHORIZED }));
    controller = new SessionController(await platformWith(null), useSessionStore);
    const older = controller.switchServer(first.url);
    await waitUntil(() => first.requests.some((request) => request.key === 'auth.me'));
    await controller.switchServer(second.url);
    me.open();
    await older;
    await waitUntil(() => first.requests.some((request) => request.key === 'auth.refresh'));
    const state = useSessionStore.getState();
    expect(state.phase).toBe('ready');
    expect(state.services?.serverUrl).toBe(second.url);
  });

  it('keeps a server switch made while going offline was still saving', async () => {
    const base = await platformWith(null);
    const saving = gate();
    let saves = 0;
    const platform: BrowserPlatform = {
      ...base,
      updateDeviceSettings: async (patch) => {
        saves += 1;
        const saved = base.updateDeviceSettings(patch);
        if (saves === 1) {
          await saving.wait();
        }
        return saved;
      },
    };
    controller = new SessionController(platform, useSessionStore);
    const offline = controller.continueOffline();
    await controller.switchServer(second.url);
    saving.open();
    await offline;
    const state = useSessionStore.getState();
    expect(state.phase).toBe('ready');
    expect(state.services?.serverUrl).toBe(second.url);
    const settings = await platform.deviceSettings();
    expect(settings.mode).toBe('synced');
    expect(settings.activeServerUrl).toBe(second.url);
  });

  it('keeps the server verified last when an older check answers later', async () => {
    const health = gate();
    first.handle('health.get', () => ({
      holdUntil: health.wait(),
      body: { name: 'relay', version: 'test', apiVersion: 1 },
    }));
    controller = new SessionController(await platformWith(null), useSessionStore);
    const older = controller.verifyServer(first.url);
    await waitUntil(() => first.requests.some((request) => request.key === 'health.get'));
    await controller.verifyServer(second.url);
    health.open();
    await older;
    const state = useSessionStore.getState();
    expect(state.step).toBe('auth');
    expect(state.pendingServerUrl).toBe(second.url);
  });

  it('logs out only the session it started from when the user switches meanwhile', async () => {
    const platform = await platformWith(null);
    controller = new SessionController(platform, useSessionStore);
    await controller.switchServer(first.url);
    const teardown = gate();
    let tearingDown = false;
    controller.addTeardown(async () => {
      tearingDown = true;
      await teardown.wait();
    });
    const leaving = controller.logout();
    await waitUntil(() => tearingDown);
    await controller.switchServer(second.url);
    teardown.open();
    await leaving;
    const state = useSessionStore.getState();
    expect(state.phase).toBe('ready');
    expect(state.services?.serverUrl).toBe(second.url);
    const settings = await platform.deviceSettings();
    expect(settings.mode).toBe('synced');
    expect(settings.activeServerUrl).toBe(second.url);
    expect(first.requests.some((request) => request.key === 'auth.logout')).toBe(true);
    expect(second.requests.some((request) => request.key === 'auth.logout')).toBe(false);
  });

  it('does not save an older login server over a newer switch', async () => {
    first.handle('auth.login', () => ({ body: session('access-login') }));
    const base = await platformWith(null);
    const reading = gate();
    let reads = 0;
    const platform: BrowserPlatform = {
      ...base,
      deviceSettings: async () => {
        reads += 1;
        await reading.wait();
        return base.deviceSettings();
      },
    };
    controller = new SessionController(platform, useSessionStore);
    await controller.verifyServer(first.url);
    const login = controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo123' });
    await waitUntil(() => reads > 0);
    await controller.switchServer(second.url);
    reading.open();
    await login;
    expect(useSessionStore.getState().services?.serverUrl).toBe(second.url);
    expect((await platform.deviceSettings()).activeServerUrl).toBe(second.url);
  });

  it('does not log out a newer session on the same server', async () => {
    const platform = await platformWith(null);
    controller = new SessionController(platform, useSessionStore);
    await controller.switchServer(first.url);
    const teardown = gate();
    let tearingDown = false;
    controller.addTeardown(async () => {
      tearingDown = true;
      await teardown.wait();
    });
    const leaving = controller.logout();
    await waitUntil(() => tearingDown);
    await controller.switchServer(first.url);
    teardown.open();
    await leaving;
    const state = useSessionStore.getState();
    expect(state.phase).toBe('ready');
    expect(state.services?.serverUrl).toBe(first.url);
    expect(first.requests.some((request) => request.key === 'auth.logout')).toBe(false);
    expect(await platform.tokenStore(first.url).load()).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import type { TokenStore } from '../src/data/remote/TokenStore';
import { type BrowserPlatform, createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { useSessionStore } from '../src/session/session-store';
import { SessionController } from '../src/session/SessionController';
import { type ContractServer, startContractServer } from './support/contract-server';
import { session, tokens } from './support/fixtures';
import { memoryStorage, resetStores } from './support/render-app';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const slowLoads = (store: TokenStore, delayMs: number): TokenStore => ({
  load: async () => {
    await pause(delayMs);
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

  const platformWith = async (slowUrl: string | null): Promise<BrowserPlatform> => {
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
            serverUrl === slowUrl
              ? slowLoads(base.tokenStore(serverUrl), 100)
              : base.tokenStore(serverUrl),
        }),
    };
  };

  it('keeps the server that was picked last when an older switch finishes later', async () => {
    const platform = await platformWith(first.url);
    controller = new SessionController(platform, useSessionStore);
    const older = controller.switchServer(first.url);
    await controller.switchServer(second.url);
    await older;
    expect(useSessionStore.getState().services?.serverUrl).toBe(second.url);
    expect((await platform.deviceSettings()).activeServerUrl).toBe(second.url);
  });

  it('drops a login that finishes after the user left the server step', async () => {
    first.handle('auth.login', () => ({ body: session('access-login') }));
    const base = await platformWith(null);
    const platform: BrowserPlatform = {
      ...base,
      updateDeviceSettings: async (patch) => {
        await pause(100);
        return base.updateDeviceSettings(patch);
      },
    };
    controller = new SessionController(platform, useSessionStore);
    await controller.verifyServer(first.url);
    const login = controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo123' });
    await waitUntil(() => first.requests.some((request) => request.key === 'accounts.list'));
    await pause(30);
    controller.goTo('welcome', null);
    await login;
    const state = useSessionStore.getState();
    expect(state.phase).toBe('onboarding');
    expect(state.step).toBe('welcome');
    expect(state.services).toBeNull();
  });

  it('ignores a session expiry reported by a server that is no longer active', async () => {
    first.handle('auth.me', () => ({ status: 401, delayMs: 120, body: UNAUTHORIZED }));
    first.handle('auth.refresh', () => ({ status: 401, body: UNAUTHORIZED }));
    controller = new SessionController(await platformWith(null), useSessionStore);
    const older = controller.switchServer(first.url);
    await pause(30);
    await controller.switchServer(second.url);
    await older;
    await pause(50);
    const state = useSessionStore.getState();
    expect(first.requests.some((request) => request.key === 'auth.refresh')).toBe(true);
    expect(state.phase).toBe('ready');
    expect(state.services?.serverUrl).toBe(second.url);
  });
});

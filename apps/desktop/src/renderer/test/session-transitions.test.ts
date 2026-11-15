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
});

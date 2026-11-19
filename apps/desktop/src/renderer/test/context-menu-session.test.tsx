// @vitest-environment jsdom
import type { ContextMenuItem } from '@relay/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openContextMenu } from '../src/features/context-menu/context-menu-store';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { setUi } from '../src/state/ui-store';
import { type ContractServer, startContractServer } from './support/contract-server';
import { session, tokens } from './support/fixtures';
import { gate } from './support/gate';
import { renderApp, resetStores, storageWith } from './support/render-app';

const ITEMS: ContextMenuItem[] = [
  { type: 'item', id: 'read', label: 'Označiť ako prečítané', enabled: true },
];

const UNAUTHORIZED = { error: { code: 'unauthorized', message: 'Neplatný token' } };

describe('context menu across a session expiry', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    setUi({ leftUser: true });
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('settles the open menu with null and does not bring it back after signing in', async () => {
    const me = gate();
    server.handle('auth.me', () => ({ status: 401, holdUntil: me.wait(), body: UNAUTHORIZED }));
    server.handle('auth.refresh', () => ({ status: 401, body: UNAUTHORIZED }));
    server.handle('auth.login', () => ({ body: session('access-2') }));
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url }),
      openContextMenu,
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    const { session: controller } = renderApp({ platform });
    await screen.findByRole('navigation', { name: 'Priečinky' });

    const settled: (string | null)[] = [];
    act(() => {
      void platform.showContextMenu({ items: ITEMS, x: 40, y: 80 }).then((id) => {
        settled.push(id);
      });
    });
    expect(screen.getByRole('menu')).toBeDefined();
    me.open();

    await waitFor(() => {
      expect(settled).toEqual([null]);
    });
    await act(async () => {
      await controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo-1234' });
      controller.finishOnboarding();
    });
    await screen.findByRole('navigation', { name: 'Priečinky' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

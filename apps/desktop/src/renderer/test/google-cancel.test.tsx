// @vitest-environment jsdom
import type { GoogleAuthorizeOutput } from '@relay/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { type ContractServer, startContractServer } from './support/contract-server';
import { session } from './support/fixtures';
import { memoryStorage, renderApp, resetStores } from './support/render-app';

const GRANT = {
  code: 'auth-code-1',
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'http://127.0.0.1:5555/oauth/callback',
};

describe('cancelling Google sign-in in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    server.handle('auth.login', () => ({ body: session('access-1') }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('never posts the grant when the user cancels before the browser returns', async () => {
    let release: (output: GoogleAuthorizeOutput) => void = () => undefined;
    let cancels = 0;
    const platform: Platform = {
      ...createBrowserPlatform(memoryStorage()),
      authorizeGoogle: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      cancelGoogleAuthorization: () => {
        cancels += 1;
        return Promise.resolve();
      },
    };
    const { session: controller } = renderApp({ platform });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    await act(async () => {
      await controller.verifyServer(server.url);
      await controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo-1234' });
    });
    await screen.findByRole('heading', { name: 'Pridať e-mailový účet' });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Prihlásiť cez Google' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zrušiť prihlásenie cez Google' }));
    });
    expect(cancels).toBe(1);
    await act(async () => {
      release({ mode: 'synced', grant: GRANT });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Prihlásiť cez Google' })).toBeDefined();
    });
    expect(server.requests.some((request) => request.key === 'accounts.create')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ContractServer,
  startContractServer,
} from '../../src/renderer/test/support/contract-server';
import { session } from '../../src/renderer/test/support/fixtures';
import { renderApp, resetStores } from '../../src/renderer/test/support/render-app';
import { type DesktopFixture, GOOGLE_CLIENT_ID, startDesktop } from './support/desktop-app';

const click = (name: string | RegExp) => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const gmailAccount = (email: string) => ({
  id: 'acc-gmail',
  userId: 'user-1',
  provider: 'gmail',
  displayName: email,
  email,
  color: '#6aa8ff',
  isPrimary: true,
  syncIntervalSeconds: 300,
  settings: {
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    username: email,
  },
  status: 'connected',
  lastError: null,
  lastSyncedAt: null,
  createdAt: '2026-11-15T08:00:00.000Z',
});

describe('Google sign-in from the renderer through the main process', () => {
  let desktop: DesktopFixture | null = null;
  let server: ContractServer | null = null;

  beforeEach(() => {
    resetStores();
  });

  afterEach(async () => {
    resetStores();
    await desktop?.close();
    await server?.close();
    desktop = null;
    server = null;
  });

  it('connects a Gmail account in local mode and lists it in the local store', async () => {
    desktop = await startDesktop({ device: { mode: null } });
    renderApp({ platform: desktop.platform });
    await screen.findByRole('button', { name: /Pokračovať bez účtu/ });
    click(/Pokračovať bez účtu/);
    await screen.findByRole('heading', { name: 'Pridať e-mailový účet' });
    click('Prihlásiť cez Google');
    expect(await screen.findByText('Účet jana@gmail.com je pripojený')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Pridať e-mailový účet' })).toBeNull();
    });
    const accounts = await desktop.harness.bridge.invoke('local.accounts.list');
    expect(accounts.ok && accounts.data.map((account) => account.provider)).toEqual(['gmail']);
    expect(desktop.harness.events.some((event) => event.type === 'account.upserted')).toBe(true);
    expect(desktop.google.tokenRequests[0]?.get('client_id')).toBe(GOOGLE_CLIENT_ID);
  });

  it('explains how to configure the Google client id when it is missing', async () => {
    desktop = await startDesktop({ googleConfigured: false, device: { mode: null } });
    renderApp({ platform: desktop.platform });
    await screen.findByRole('button', { name: /Pokračovať bez účtu/ });
    click(/Pokračovať bez účtu/);
    await screen.findByRole('heading', { name: 'Pridať e-mailový účet' });
    click('Prihlásiť cez Google');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('RELAY_GOOGLE_CLIENT_ID');
    expect(alert.textContent).toContain(desktop.dir.file('google-oauth.json'));
    expect(screen.getByRole('button', { name: 'Prihlásiť cez Google' })).toBeDefined();
  });

  it('runs the loopback flow in main and posts the grant to the server in synced mode', async () => {
    server = await startContractServer();
    const remote = server;
    remote.handle('auth.login', () => ({ body: session('access-1') }));
    remote.handle('accounts.create', () => ({ body: gmailAccount('jana@gmail.com') }));
    desktop = await startDesktop({ device: { mode: null } });
    const { session: controller } = renderApp({ platform: desktop.platform });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    await act(async () => {
      await controller.verifyServer(remote.url);
      await controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo-1234' });
    });
    await screen.findByRole('heading', { name: 'Pridať e-mailový účet' });
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail' }), {
      target: { value: 'jana@gmail.com' },
    });
    click('Prihlásiť cez Google');
    expect(await screen.findByText('Účet jana@gmail.com je pripojený')).toBeDefined();
    const create = remote.requests.find((request) => request.key === 'accounts.create');
    expect(create?.authorization).toBe('Bearer access-1');
    expect(create?.body).toMatchObject({
      provider: 'gmail',
      oauth: {
        code: 'auth-code-1',
        redirectUri: expect.stringMatching(
          /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/,
        ) as unknown,
      },
    });
    const verifier = (create?.body as { oauth: { codeVerifier: string } }).oauth.codeVerifier;
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(desktop.google.tokenRequests).toEqual([]);
    const local = await desktop.harness.bridge.invoke('local.accounts.list');
    expect(local.ok && local.data).toEqual([]);
  });

  it('shows a Slovak hint when the server has no Google client', async () => {
    server = await startContractServer();
    const remote = server;
    remote.handle('auth.login', () => ({ body: session('access-1') }));
    remote.handle('accounts.create', () => ({
      status: 403,
      body: {
        error: { code: 'forbidden', message: 'Google OAuth is not configured on this server' },
      },
    }));
    desktop = await startDesktop({ device: { mode: null } });
    const { session: controller } = renderApp({ platform: desktop.platform });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    await act(async () => {
      await controller.verifyServer(remote.url);
      await controller.authenticate('login', { email: 'jan@domov.sk', password: 'heslo-1234' });
    });
    await screen.findByRole('heading', { name: 'Pridať e-mailový účet' });
    click('Prihlásiť cez Google');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('GOOGLE_OAUTH_CLIENT_ID');
  });
});

// @vitest-environment jsdom
import { DEVICE_SETTINGS_KEY } from '../src/platform/BrowserPlatform';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ContractServer, startContractServer } from './support/contract-server';
import { session } from './support/fixtures';
import { memoryStorage, renderApp, resetStores } from './support/render-app';

const field = (name: string) => screen.getByRole('textbox', { name });
const type = (element: HTMLElement, value: string) => {
  fireEvent.change(element, { target: { value } });
};
const password = () =>
  document.querySelector<HTMLInputElement>('input[type="password"]') ??
  document.createElement('input');
const click = (name: string | RegExp) => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('onboarding', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('validates the server, registers this device and adds an IMAP account', async () => {
    const storage = memoryStorage();
    server.handle('auth.register', () => ({ body: session('access-1') }));
    server.handle('accounts.testConnection', () => ({
      body: { imap: { ok: true, error: null }, smtp: { ok: false, error: 'Overenie zlyhalo' } },
    }));
    server.handle('accounts.create', (request) => ({
      body: {
        id: 'acc-1',
        userId: 'user-1',
        provider: 'imap',
        displayName: 'Firma',
        email: 'ja@firma.sk',
        color: '#6aa8ff',
        isPrimary: true,
        syncIntervalSeconds: 300,
        settings: (request.body as { settings: unknown }).settings,
        status: 'connected',
        lastError: null,
        lastSyncedAt: null,
        createdAt: '2026-11-15T08:00:00.000Z',
      },
    }));
    renderApp({ storage });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    click(/Pripojiť k serveru/);
    click(/Pokračovať/);
    expect(screen.getByRole('alert').textContent).toContain('Zadaj adresu servera');
    type(field('Adresa servera'), 'http://127.0.0.1:1');
    click(/Pokračovať/);
    expect((await screen.findByRole('alert')).textContent).toContain('neodpovedá Relay server');
    type(field('Adresa servera'), server.url);
    click(/Pokračovať/);
    expect(await screen.findByRole('heading', { name: 'Prihlásiť sa' })).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'Nový účet' }));
    });
    type(field('Meno'), 'Ján Novák');
    type(field('E-mail'), 'jan@domov');
    type(password(), 'kratke');
    click(/Zaregistrovať sa/);
    expect(screen.getByRole('alert').textContent).toBe('Zadaj platnú e-mailovú adresu.');
    type(field('E-mail'), 'jan@domov.sk');
    click(/Zaregistrovať sa/);
    expect(screen.getByRole('alert').textContent).toBe('Heslo musí mať aspoň 8 znakov.');
    type(password(), 'dlhe-heslo-123');
    click(/Zaregistrovať sa/);
    expect(await screen.findByRole('heading', { name: 'Pridať e-mailový účet' })).toBeDefined();
    const register = server.requests.find((request) => request.key === 'auth.register');
    expect(register?.body).toMatchObject({
      email: 'jan@domov.sk',
      displayName: 'Ján Novák',
      device: { name: 'Prehliadač (Linux)', platform: 'linux' },
    });
    expect(JSON.parse(storage.data.get(DEVICE_SETTINGS_KEY) ?? '{}')).toMatchObject({
      mode: 'synced',
      activeServerUrl: server.url,
      savedServers: [{ url: server.url }],
    });
    type(field('E-mail'), 'ja@firma.sk');
    expect((field('IMAP server') as HTMLInputElement).value).toBe('imap.firma.sk');
    click(/Pridať účet/);
    expect(screen.getByRole('alert').textContent).toBe('Doplň heslo k schránke.');
    type(password(), 'tajne-heslo');
    click('Otestovať pripojenie');
    expect((await screen.findByText(/SMTP: Overenie zlyhalo/)).textContent).toContain('SMTP');
    click(/Pridať účet/);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Pridať e-mailový účet' })).toBeNull();
    });
    expect(
      server.requests.find((request) => request.key === 'accounts.create')?.authorization,
    ).toBe('Bearer access-1');
  });

  it('drops a stale error after a successful connection test', async () => {
    server.handle('auth.register', () => ({ body: session('access-3') }));
    server.handle('accounts.create', () => ({
      status: 502,
      body: { error: { code: 'provider_error', message: 'Server schránky neodpovedá' } },
    }));
    server.handle('accounts.testConnection', () => ({
      body: { imap: { ok: true, error: null }, smtp: { ok: true, error: null } },
    }));
    renderApp({ storage: memoryStorage() });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    click(/Pripojiť k serveru/);
    type(field('Adresa servera'), server.url);
    click(/Pokračovať/);
    expect(await screen.findByRole('heading', { name: 'Prihlásiť sa' })).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'Nový účet' }));
    });
    type(field('Meno'), 'Ján Novák');
    type(field('E-mail'), 'jan@domov.sk');
    type(password(), 'dlhe-heslo-123');
    click(/Zaregistrovať sa/);
    expect(await screen.findByRole('heading', { name: 'Pridať e-mailový účet' })).toBeDefined();
    type(field('E-mail'), 'ja@posta.test');
    click(/Pridať účet/);
    expect(screen.getByRole('alert').textContent).toBe('Doplň heslo k schránke.');
    type(password(), 'tajne-heslo');
    type(field('IMAP server'), '127.0.0.1');
    type(field('SMTP server'), '127.0.0.1');
    click(/Pridať účet/);
    expect((await screen.findByRole('alert')).textContent).toContain('Server schránky neodpovedá');

    click('Otestovať pripojenie');

    expect((await screen.findByRole('status')).textContent).toBe(
      'Pripojenie funguje, IMAP aj SMTP odpovedajú.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    type(field('IMAP server'), '');
    click('Otestovať pripojenie');
    expect(screen.getByRole('alert').textContent).toContain('Doplň IMAP server');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('goes straight to the inbox after a login when the user already has mail accounts', async () => {
    server.handle('auth.login', () => ({ body: session('access-2') }));
    server.handle('accounts.list', () => ({
      body: [
        {
          id: 'acc-1',
          userId: 'user-1',
          provider: 'imap',
          displayName: 'Firma',
          email: 'ja@firma.sk',
          color: '#6aa8ff',
          isPrimary: true,
          syncIntervalSeconds: 300,
          settings: {
            imap: { host: 'imap.firma.sk', port: 993, secure: true },
            smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
            username: 'ja@firma.sk',
          },
          status: 'connected',
          lastError: null,
          lastSyncedAt: null,
          createdAt: '2026-11-15T08:00:00.000Z',
        },
      ],
    }));
    renderApp({ storage: memoryStorage() });
    await screen.findByRole('button', { name: /Pripojiť k serveru/ });
    click(/Pripojiť k serveru/);
    type(field('Adresa servera'), server.url);
    click(/Pokračovať/);
    expect(await screen.findByRole('heading', { name: 'Prihlásiť sa' })).toBeDefined();
    type(field('E-mail'), 'jan@domov.sk');
    type(password(), 'dlhe-heslo-123');
    click(/^Prihlásiť sa/);

    expect(await screen.findByRole('complementary', { name: 'Pravý panel' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Pridať e-mailový účet' })).toBeNull();
    expect(server.requests.find((request) => request.key === 'accounts.list')?.authorization).toBe(
      'Bearer access-2',
    );
  });

  it('continues without an account into the demo mailbox in a browser', async () => {
    renderApp({ storage: memoryStorage() });
    await screen.findByRole('button', { name: /Pokračovať bez účtu/ });
    click(/Pokračovať bez účtu/);
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
  });
});

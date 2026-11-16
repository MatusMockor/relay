// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { setUi } from '../src/state/ui-store';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const failed = {
  accountId: 'acc-1',
  accountEmail: 'me@firma.sk',
  messageId: 'msg-1',
  threadId: 'thread-1',
  subject: null,
  from: null,
  date: null,
  attempts: 6,
  failedAt: new Date().toISOString(),
  lastError: 'deadlock detected',
};

describe('failed invitations in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    const thread = serverThread('Pozvánka: Retro');
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const openSettings = async () => {
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });
  };

  it('hides the list while nothing failed', async () => {
    server.handle('calendar.listFailedInvitations', () => ({ body: [] }));
    await openSettings();

    expect(await screen.findByRole('heading', { name: 'Kalendáre' })).toBeTruthy();
    await waitFor(() => {
      expect(
        server.requests.some((request) => request.url === '/calendar/failed-invitations'),
      ).toBe(true);
    });
    expect(screen.queryByRole('region', { name: 'Nespracované pozvánky' })).toBeNull();
  });

  it('tells the user when a retried invitation still fails and keeps the dismiss action', async () => {
    server.handle('calendar.listFailedInvitations', () => ({ body: [failed] }));
    server.handle('calendar.retryFailedInvitation', () => ({ body: { applied: false } }));
    server.handle('calendar.dismissFailedInvitation', () => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Pozvánka sa už nenašla.' } },
    }));
    await openSettings();

    const section = await screen.findByRole('region', { name: 'Nespracované pozvánky' });
    expect(within(section).getByText('Správa s pozvánkou už nie je dostupná')).toBeTruthy();
    expect(
      within(section).getByText(/^Neznámy odosielateľ · me@firma\.sk · 6 pokusov/),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(within(section).getByRole('button', { name: 'Skúsiť znova' }));
    });
    expect(
      await screen.findByText(
        'Pozvánku sa ani teraz nepodarilo spracovať, skúsime to znova neskôr',
      ),
    ).toBeTruthy();
    expect(
      server.requests.some(
        (request) =>
          request.method === 'POST' &&
          request.url === '/calendar/failed-invitations/acc-1/msg-1/retry',
      ),
    ).toBe(true);

    act(() => {
      fireEvent.click(within(section).getByRole('button', { name: 'Zahodiť' }));
    });
    expect(await screen.findByText('Pozvánka sa už nenašla.')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Zahodiť' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform, DEVICE_SETTINGS_KEY } from '../src/platform/BrowserPlatform';
import { useSessionStore } from '../src/session/session-store';
import { type ContractServer, startContractServer } from './support/contract-server';
import { TEST_DEVICE, tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';

describe('settings', () => {
  let first: ContractServer;
  let second: ContractServer;

  beforeEach(async () => {
    resetStores();
    first = await startContractServer();
    second = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await Promise.all([first.close(), second.close()]);
  });

  it('switches the active server and lists and revokes devices', async () => {
    const storage = storageWith({
      mode: 'synced',
      activeServerUrl: first.url,
      savedServers: [
        { name: 'Domov', url: first.url },
        { name: 'Práca', url: second.url },
      ],
    });
    const platform = createBrowserPlatform(storage);
    await platform.tokenStore(first.url).save(tokens('token-a'));
    await platform.tokenStore(second.url).save(tokens('token-b'));
    second.handle('devices.list', () => ({
      body: [
        { ...TEST_DEVICE, current: true },
        {
          ...TEST_DEVICE,
          id: 'device-2',
          name: 'Relay na macOS',
          platform: 'macos',
          current: false,
        },
      ],
    }));
    renderApp({ platform });
    await waitFor(() => {
      expect(
        first.requests.some(
          (request) => request.key === 'threads.list' && request.authorization === 'Bearer token-a',
        ),
      ).toBe(true);
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: ',', ctrlKey: true });
    });
    const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Server' }));
    });
    expect(await within(sheet).findByText('Aktívny')).toBeDefined();
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Prepnúť' }));
    });
    await waitFor(() => {
      expect(useSessionStore.getState().services?.serverUrl).toBe(second.url);
    });
    await waitFor(() => {
      expect(
        second.requests.some(
          (request) => request.key === 'auth.me' && request.authorization === 'Bearer token-b',
        ),
      ).toBe(true);
    });
    expect(JSON.parse(storage.data.get(DEVICE_SETTINGS_KEY) ?? '{}')).toMatchObject({
      activeServerUrl: second.url,
      mode: 'synced',
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: ',', ctrlKey: true });
    });
    act(() => {
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Nastavenia' })).getByRole('button', {
          name: 'Zariadenia',
        }),
      );
    });
    expect(await screen.findByText('Relay na macOS')).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Odhlásiť' }));
    });
    await waitFor(() => {
      expect(
        second.requests.some(
          (request) => request.key === 'devices.revoke' && request.url === '/devices/device-2',
        ),
      ).toBe(true);
    });
  });
});

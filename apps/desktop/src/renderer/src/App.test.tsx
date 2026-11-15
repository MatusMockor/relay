// @vitest-environment jsdom
import type { IpcResult, RelayBridge } from '@relay/shared/ipc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

const renderApp = (bridge: RelayBridge | null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App bridge={bridge} />
    </QueryClientProvider>,
  );

const electronBridge: RelayBridge = {
  invoke: () =>
    Promise.resolve({
      ok: true,
      data: {
        name: 'Relay',
        version: '0.1.0',
        platform: 'linux',
        electronVersion: '45.3.2',
        isPackaged: false,
      },
    } as IpcResult<never>),
  subscribe: () => () => undefined,
};

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders in a plain browser without the Electron bridge', () => {
    renderApp(null);
    expect(screen.getByRole('heading', { name: 'Relay' })).toBeDefined();
    expect(screen.getByText('Webový režim - rozhranie Electronu nie je dostupné.')).toBeDefined();
  });

  it('shows the app version reported by the main process', async () => {
    renderApp(electronBridge);
    expect(await screen.findByText('Verzia 0.1.0')).toBeDefined();
  });
});

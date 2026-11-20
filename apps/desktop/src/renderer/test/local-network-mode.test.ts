import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { withLocalNetworkMode } from '../src/data/local-network-mode';
import type { AppServices, SessionMode } from '../src/session/services';

const servicesIn = (mode: SessionMode): AppServices => ({
  mode,
  client: createDemoMailClient({ aiStepMs: 0 }),
  server: null,
  serverUrl: null,
});

const configured = (services: AppServices | null) =>
  withLocalNetworkMode(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    services,
  ).getDefaultOptions();

describe('withLocalNetworkMode', () => {
  it('keeps queries and mutations running without a browser network in local modes', () => {
    const modes: SessionMode[] = ['local', 'demo'];
    modes.forEach((mode) => {
      const defaults = configured(servicesIn(mode));
      expect(defaults.queries).toMatchObject({ retry: false, networkMode: 'always' });
      expect(defaults.mutations).toMatchObject({ networkMode: 'always' });
    });
  });

  it('leaves the online network mode for the synced server mode and before boot', () => {
    expect(configured(servicesIn('synced')).queries?.networkMode).toBeUndefined();
    expect(configured(null).queries?.networkMode).toBeUndefined();
  });
});

import type { QueryClient } from '@tanstack/react-query';
import type { AppServices } from '../session/services';

export const withLocalNetworkMode = (
  client: QueryClient,
  services: AppServices | null,
): QueryClient => {
  if (services === null || services.mode === 'synced') {
    return client;
  }
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, networkMode: 'always' },
    mutations: { ...defaults.mutations, networkMode: 'always' },
  });
  return client;
};

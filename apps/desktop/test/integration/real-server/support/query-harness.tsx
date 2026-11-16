import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, type RenderHookResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ServicesProvider } from '../../../../src/renderer/src/data/hooks/services-context';
import type { MailClient } from '../../../../src/renderer/src/data/MailClient';

export interface QueryHarness {
  readonly queryClient: QueryClient;
  render<Result>(hook: () => Result): RenderHookResult<Result, unknown>;
}

export const createQueryHarness = (client: MailClient, serverUrl: string): QueryHarness => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={{ mode: 'synced', client, server: null, serverUrl }}>
        {children}
      </ServicesProvider>
    </QueryClientProvider>
  );
  return {
    queryClient,
    render: (hook) => renderHook(hook, { wrapper }),
  };
};

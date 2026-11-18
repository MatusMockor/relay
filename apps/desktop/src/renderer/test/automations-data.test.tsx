// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { MailClient } from '../src/data/MailClient';
import { ServicesProvider } from '../src/data/hooks/services-context';
import { useAutomations } from '../src/data/hooks/use-mail-queries';
import {
  toAutomationInput,
  useReplaceAutomations,
} from '../src/data/hooks/use-replace-automations';
import type { AppServices } from '../src/session/services';

const NOW = new Date(2026, 10, 19, 9, 41);

const wrapperFor = (client: MailClient) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const services = { client, mode: 'demo' } as unknown as AppServices;
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ServicesProvider services={services}>{children}</ServicesProvider>
      </QueryClientProvider>
    );
  };
};

const required = <T,>(value: T | undefined): T => {
  expect(value).toBeDefined();
  return value as T;
};

const useAutomationData = () => ({ list: useAutomations(), replace: useReplaceAutomations() });

describe('automation data hooks on the demo client', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists the seeded rules and saves edits, toggles and deletes, also the default rule', async () => {
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0 });
    const { result } = renderHook(useAutomationData, { wrapper: wrapperFor(client) });
    await waitFor(() => {
      expect(result.current.list.data).toBeDefined();
    });
    const current = result.current.list.data ?? [];
    expect(current.map((item) => [item.name, item.preset])).toEqual([
      ['Jira spomenutia', null],
      ['Tibor', null],
      ['GitLab do Projektov', null],
      ['Jira tasky', 'jiraTasks'],
    ]);
    const preset = toAutomationInput(required(current.find((item) => item.preset !== null)));

    await act(async () => {
      await result.current.replace.mutateAsync([
        { ...preset, enabled: true },
        {
          accountId: null,
          name: 'Od Tibora',
          enabled: true,
          order: 9,
          conditions: [{ type: 'fromAddress', address: 'tibor@efabrica.sk' }],
          ai: { runner: 'codex', model: 'gpt-6-luna', effort: 'low', instructions: null },
          actions: [{ type: 'task' }, { type: 'archive' }],
        },
      ]);
    });

    await waitFor(() => {
      expect(
        result.current.list.data?.map((item) => [item.name, item.enabled, item.order]),
      ).toEqual([
        ['Jira tasky', true, 0],
        ['Od Tibora', true, 1],
      ]);
    });
    await act(async () => {
      await result.current.replace.mutateAsync([]);
    });
    await waitFor(() => {
      expect(result.current.list.data).toEqual([]);
    });
  });

  it('restores the removed default rule turned off', async () => {
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0 });
    const kept = (await client.listAutomations()).filter((item) => item.preset === null);
    await client.replaceAutomations(kept.map(toAutomationInput));

    const restored = await client.restoreDefaultAutomation();

    expect(restored.map((item) => [item.name, item.preset, item.enabled, item.order])).toEqual([
      ['Jira spomenutia', null, true, 0],
      ['Tibor', null, true, 1],
      ['GitLab do Projektov', null, true, 2],
      ['Jira tasky', 'jiraTasks', false, 3],
    ]);
    expect(await client.restoreDefaultAutomation()).toEqual(restored);
  });

  it('rejects a model that does not belong to the runner', async () => {
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0 });
    const preset = required((await client.listAutomations()).find((item) => item.preset !== null));

    await expect(
      client.replaceAutomations([
        {
          ...toAutomationInput(preset),
          ai: { runner: 'claude', model: 'gpt-6-luna', effort: null, instructions: null },
        },
      ]),
    ).rejects.toThrow('Automatizácia nie je platná');
  });
});

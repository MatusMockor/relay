// @vitest-environment jsdom
import {
  type AccountId,
  AccountIdSchema,
  type MailAccount,
  type RealtimeEvent,
} from '@relay/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { queryKeys } from '../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { ServicesProvider } from '../src/data/hooks/services-context';
import { useAccounts } from '../src/data/hooks/use-mail-queries';
import { useReorderAccounts } from '../src/data/hooks/use-reorder-accounts';
import type { MailClient } from '../src/data/MailClient';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { suggestSenderName } from '../src/features/accounts/suggested-sender-name';
import { useAccountsModel } from '../src/features/mail/use-accounts-model';
import { type Gate, gate } from './features-support';
import {
  type ContractServer,
  type HandlerResult,
  startContractServer,
} from './support/contract-server';
import { tokens } from './support/fixtures';
import { resetStores } from './support/render-app';

const AT = '2026-11-15T08:00:00.000Z';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await pause(10);
  }
  expect(check()).toBe(true);
};

const statusChanged = (accountId: AccountId): RealtimeEvent => ({
  type: 'account.status',
  at: AT,
  data: { accountId, status: 'connected', lastSyncedAt: AT, error: null },
});

const reorderedElsewhere = (accountIds: AccountId[]): RealtimeEvent => ({
  type: 'accounts.reordered',
  at: AT,
  data: { accountIds },
});

const wrapperFor =
  (client: MailClient, queryClient: QueryClient) =>
  ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={{ mode: 'synced', client, server: null, serverUrl: null }}>
        {children}
      </ServicesProvider>
    </QueryClientProvider>
  );

const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

describe('account order cache', () => {
  let server: ContractServer;
  let client: MailClient;
  let queryClient: QueryClient;
  let stored: MailAccount[];
  let listHold: Gate | null;

  beforeEach(async () => {
    stored = buildDemoState(new Date()).accounts;
    server = await startContractServer();
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    queryClient = testQueryClient();
    listHold = null;
    server.handle('accounts.list', () => ({
      body: stored,
      ...(listHold === null ? {} : { holdUntil: listHold.wait() }),
    }));
  });

  afterEach(async () => {
    cleanup();
    client.dispose();
    queryClient.clear();
    await server.close();
  });

  const lists = () => server.requests.filter((request) => request.key === 'accounts.list').length;

  const render = async () => {
    const hook = renderHook(() => ({ accounts: useAccounts(), reorder: useReorderAccounts() }), {
      wrapper: wrapperFor(client, queryClient),
    });
    await waitUntil(() => hook.result.current.accounts.data !== undefined);
    return hook;
  };

  const shownIds = (): string[] =>
    (queryClient.getQueryData<MailAccount[]>(queryKeys.accounts()) ?? []).map(
      (account) => account.id,
    );

  it('keeps the optimistic order while account events arrive and refetches exactly once it settles', async () => {
    const held = gate();
    const reordered = [...stored].reverse();
    server.handle('accounts.reorder', () => {
      stored = reordered;
      return { body: reordered, holdUntil: held.wait() };
    });
    const hook = await render();
    const before = lists();

    act(() => {
      hook.result.current.reorder.mutate(reordered);
    });
    await waitUntil(() => shownIds().join() === reordered.map((account) => account.id).join());
    applyRealtimeEvent(queryClient, statusChanged(AccountIdSchema.parse('acc-efa')));
    await pause(INVALIDATION_WINDOW_MS * 3);

    expect(lists()).toBe(before);
    expect(shownIds()).toEqual(reordered.map((account) => account.id));

    held.open();
    await waitUntil(() => lists() === before + 1 && queryClient.isFetching() === 0);
    await pause(INVALIDATION_WINDOW_MS * 3);
    expect(lists()).toBe(before + 1);
    expect(shownIds()).toEqual(reordered.map((account) => account.id));
  });

  const rejected = {
    status: 409,
    body: { error: { code: 'conflict', message: 'Poradie sa zmenilo' } },
  };

  const queueTwoMoves = async (answers: readonly (() => HandlerResult)[]) => {
    const held = gate();
    let call = 0;
    server.handle('accounts.reorder', () => {
      const answer = answers[call] ?? answers[answers.length - 1];
      call += 1;
      return { ...(answer?.() ?? rejected), holdUntil: held.wait() };
    });
    const hook = await render();
    const before = lists();
    listHold = gate();
    const original = stored.map((account) => account.id);
    const first = [...stored].reverse();
    const second = [...stored.slice(1), ...stored.slice(0, 1)];
    act(() => {
      hook.result.current.reorder.mutate(first);
      hook.result.current.reorder.mutate(second);
    });
    await waitUntil(() => shownIds().join() === second.map((account) => account.id).join());
    held.open();
    await waitUntil(() => lists() === before + 1);
    return { original, first: first.map((account) => account.id) };
  };

  it('restores the confirmed order when both queued moves fail', async () => {
    const { original } = await queueTwoMoves([() => rejected, () => rejected]);

    expect(shownIds()).toEqual(original);
  });

  it('keeps the first saved move when only the queued second move fails', async () => {
    const saved = [...stored].reverse();
    const { first } = await queueTwoMoves([() => ({ body: saved }), () => rejected]);

    expect(shownIds()).toEqual(first);
  });

  it('refetches an order saved on another device while the local reorder settled', async () => {
    const local = [...stored].reverse();
    const remote = [...stored.slice(1), ...stored.slice(0, 1)];
    server.handle('accounts.reorder', () => {
      stored = local;
      return { body: local };
    });
    const hook = await render();
    const before = lists();
    listHold = gate();

    act(() => {
      hook.result.current.reorder.mutate(local);
    });
    await waitUntil(() => lists() === before + 1);
    stored = remote;
    applyRealtimeEvent(queryClient, reorderedElsewhere(remote.map((account) => account.id)));
    await pause(INVALIDATION_WINDOW_MS * 3);
    listHold.open();

    await waitUntil(() => shownIds().join() === remote.map((account) => account.id).join());
    expect(lists()).toBe(before + 2);
  });
});

describe('accounts model without a primary account', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('uses the oldest account as the default sender, not the first in the custom order', () => {
    const accounts = buildDemoState(new Date())
      .accounts.map((account, index) => ({
        ...account,
        isPrimary: false,
        createdAt: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
      }))
      .reverse();
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.accounts(), accounts);

    const { result } = renderHook(() => useAccountsModel(), {
      wrapper: wrapperFor(createDemoMailClient({ aiStepMs: 0 }), queryClient),
    });

    expect(result.current.accounts.map((account) => account.id)).toEqual(
      accounts.map((account) => account.id),
    );
    expect(result.current.primary?.id).toBe(accounts.at(-1)?.id);
  });
});

describe('suggested sender name without a named primary account', () => {
  it('takes the oldest named account, not the first in the custom order', () => {
    const ordered = buildDemoState(new Date())
      .accounts.map((account, index) => ({
        ...account,
        isPrimary: false,
        senderName: index === 0 ? null : `Meno ${String(index)}`,
        createdAt: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
      }))
      .reverse();

    expect(suggestSenderName(ordered, 'Používateľ')).toBe('Meno 1');
  });
});

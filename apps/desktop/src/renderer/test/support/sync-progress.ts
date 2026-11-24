import type { AccountStatus, MailAccount, RealtimeEvent, SyncStage } from '@relay/shared';
import { act, screen, within } from '@testing-library/react';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { DemoHistory } from '../../src/data/demo/demo-history';
import type { MailClient, MailEventListener } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';
import { present } from './present';

export const SYNC_AT = '2026-11-15T10:00:00.000Z';
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

interface SyncingState {
  status: AccountStatus;
  first: MailAccount | null;
}

const withStatus =
  (inner: MailClient, state: SyncingState): MailClient['listAccounts'] =>
  async () => {
    const [first, ...rest] = await inner.listAccounts();
    const lastSyncedAt = state.status === 'syncing' ? null : SYNC_AT;
    const account = { ...present(first), status: state.status, lastSyncedAt };
    state.first = account;
    return [account, ...rest];
  };

export const syncingClient = (history?: DemoHistory) => {
  const inner = createDemoMailClient({
    aiStepMs: 0,
    ...(history === undefined ? {} : { history }),
  });
  const listeners = new Set<MailEventListener>();
  const state: SyncingState = { status: 'syncing', first: null };
  const client: MailClient = {
    ...inner,
    listAccounts: withStatus(inner, state),
    subscribe: (listener) => {
      listeners.add(listener);
      const stop = inner.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
  };
  const emit = async (event: RealtimeEvent) => {
    await act(async () => {
      listeners.forEach((listener) => {
        listener(event);
      });
      await Promise.resolve();
    });
  };
  const account = () => present(state.first);
  const progress = (stage: SyncStage | undefined, processed: number, total: number | null) =>
    emit({
      type: 'sync.progress',
      at: SYNC_AT,
      data: {
        accountId: account().id,
        mailboxId: null,
        phase: stage === undefined ? 'idle' : 'messages',
        processed,
        total,
        ...(stage === undefined ? {} : { stage }),
      },
    });
  const announce = (status: AccountStatus) =>
    emit({
      type: 'account.status',
      at: SYNC_AT,
      data: { accountId: account().id, status, lastSyncedAt: SYNC_AT, error: null },
    });
  const finish = () => {
    state.status = 'connected';
    return announce('connected');
  };
  return { client, account, emit, progress, announce, finish };
};

export const openAccounts = async (account: () => MailAccount) => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
  });
  return screen.findByRole('region', { name: account().displayName });
};

export const statusText = (card: HTMLElement): string =>
  (within(card).getByText('Stav').closest('.srow')?.textContent ?? '').replace(NBSP, ' ');

export const barValue = (card: HTMLElement): string | null =>
  within(card).queryByRole('progressbar')?.getAttribute('aria-valuenow') ?? null;

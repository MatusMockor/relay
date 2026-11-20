// @vitest-environment jsdom
import { AccountIdSchema, type HistoryProgress, type RealtimeEvent } from '@relay/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient, MailEventListener } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const ACCOUNT = AccountIdSchema.parse('acc-history');
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

const progressOf = (patch: Partial<HistoryProgress>): HistoryProgress => ({
  accountId: ACCOUNT,
  stored: 12_340,
  total: 48_000,
  state: 'running',
  ...patch,
});

const controlledClient = (kind: MailClient['kind'] = 'demo') => {
  const listeners = new Set<MailEventListener>();
  const control = { progress: [progressOf({})], calls: 0 };
  const base = demoClient();
  const client: MailClient = {
    ...base,
    kind,
    historyProgress: () => {
      control.calls += 1;
      return Promise.resolve(control.progress);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      const unsubscribe = base.subscribe(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };
  const publish = (progress: HistoryProgress) => {
    control.progress = [progress];
    const event: RealtimeEvent = {
      type: 'sync.history',
      at: new Date().toISOString(),
      data: progress,
    };
    act(() => {
      listeners.forEach((listener) => {
        listener(event);
      });
    });
  };
  return { client, control, publish };
};

const openSync = async () => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'sync', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const historyText = (sheet: HTMLElement): string =>
  (within(sheet).getByText('Staršia pošta').closest('.srow')?.textContent ?? '').replace(NBSP, ' ');

describe('older mail progress in sync settings', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('shows the download progress with Slovak number formatting and follows realtime updates', async () => {
    const { client, publish } = controlledClient();
    renderApp({ demo: () => client });
    const sheet = await openSync();

    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 12 340 z 48 000 správ');
    });
    expect(within(sheet).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('26');

    publish(progressOf({ state: 'paused' }));
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Pozastavené, skúsim znova o chvíľu');
    });

    publish(progressOf({ stored: 48_000, state: 'done' }));
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Celá história je stiahnutá');
    });
    expect(within(sheet).queryByRole('progressbar')).toBeNull();
  });

  it('hides the row in remote mode', async () => {
    const remote = controlledClient('remote');
    renderApp({ demo: () => remote.client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(within(sheet).getByText('Skontrolovať teraz', { selector: 'b' })).toBeTruthy();
    });
    expect(within(sheet).queryByText('Staršia pošta')).toBeNull();
    expect(remote.control.calls).toBe(0);
  });

  it('hides the row when no account has history', async () => {
    const empty = controlledClient();
    empty.control.progress = [];
    renderApp({ demo: () => empty.client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(empty.control.calls).toBe(1);
    });
    expect(within(sheet).queryByText('Staršia pošta')).toBeNull();
  });
});

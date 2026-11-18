// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { centerRect } from '../src/features/folders/rect';
import { INBOX } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, gate } from './features-support';
import { renderApp, resetMemoryStores, resetStores } from './support/render-app';

const SCOPE_KEY = 'relay.scope';
const freelance = demoIds.account('fl');

const start = async (client = demoClient()) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

const restart = async () => {
  resetMemoryStores();
  await start();
};

const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

const pickAccount = (name: RegExp) => {
  act(() => {
    setUi({ overlay: { kind: 'accounts', anchor: centerRect() } });
  });
  click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name }));
};

describe('remembering the account scope', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('stores the account the user picks', async () => {
    await start();

    pickAccount(/Freelance/);

    expect(useUiStore.getState().scope).toBe(freelance);
    expect(window.localStorage.getItem(SCOPE_KEY)).toBe(JSON.stringify(freelance));
  });

  it('restores the picked account after a restart and keeps the default folder', async () => {
    await start();
    pickAccount(/Freelance/);

    await restart();

    expect(useUiStore.getState().scope).toBe(freelance);
    expect(useUiStore.getState().folder).toEqual(INBOX);
  });

  it('restores all accounts after the user switches back to them', async () => {
    await start();
    pickAccount(/Freelance/);
    pickAccount(/Všetky účty/);

    await restart();

    expect(useUiStore.getState().scope).toBe('all');
    expect(window.localStorage.getItem(SCOPE_KEY)).toBe(JSON.stringify('all'));
  });

  it('falls back to all accounts when the stored account was removed', async () => {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(freelance));
    const client = demoClient();
    await client.removeAccount(freelance);

    await start(client);

    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe('all');
    });
    expect(window.localStorage.getItem(SCOPE_KEY)).toBe(JSON.stringify('all'));
  });

  it('falls back to all accounts when the current account is disconnected', async () => {
    await start();
    pickAccount(/Freelance/);
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
    });
    const card = await screen.findByRole('region', { name: 'Freelance' });
    click(within(card).getByRole('button', { name: 'Odpojiť' }));
    click(
      within(screen.getByRole('alertdialog', { name: /Odpojiť účet/ })).getByRole('button', {
        name: /^Odpojiť/,
      }),
    );

    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe('all');
    });
    expect(window.localStorage.getItem(SCOPE_KEY)).toBe(JSON.stringify('all'));
  });

  it.each(['not json', JSON.stringify({ scope: 'acc-fl' }), JSON.stringify('bad id!'), '42'])(
    'ignores invalid stored data %s',
    async (raw) => {
      window.localStorage.setItem(SCOPE_KEY, raw);

      await start();

      expect(useUiStore.getState().scope).toBe('all');
    },
  );

  it('keeps a stored account while the accounts are still loading', async () => {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(freelance));
    const base = demoClient();
    const held = gate();
    renderApp({
      demo: () => ({
        ...base,
        listAccounts: async () => {
          await held.wait();
          return base.listAccounts();
        },
      }),
    });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    expect(useUiStore.getState().scope).toBe(freelance);

    held.open();
    await waitFor(() => {
      expect(screen.getAllByText('Freelance').length).toBeGreaterThan(0);
    });
    expect(useUiStore.getState().scope).toBe(freelance);
  });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { centerRect } from '../src/features/folders/rect';
import { selectFolder } from '../src/features/mail/navigation';
import { INBOX } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { click } from './support/automations';
import { renderApp, resetStores } from './support/render-app';

const SENT = { kind: 'view', view: 'sent' } as const;

const release = (button: number): void => {
  act(() => {
    fireEvent.mouseUp(window, { button });
  });
};

const pickAccount = (name: RegExp): void => {
  act(() => {
    setUi({ overlay: { kind: 'accounts', anchor: centerRect() } });
  });
  click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name }));
};

const disconnectFreelance = async (): Promise<void> => {
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
    expect(screen.queryByRole('region', { name: 'Freelance' })).toBeNull();
  });
};

describe('history after an account is disconnected', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('steps over the removed account instead of looping on it', async () => {
    renderApp({ demo: () => demoClient() });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    pickAccount(/Freelance/);
    expect(useUiStore.getState().scope).toBe(demoIds.account('fl'));
    pickAccount(/Všetky účty/);
    act(() => {
      selectFolder(SENT);
    });
    await disconnectFreelance();

    release(3);
    release(3);
    release(3);
    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe('all');
    });
    release(3);
    expect(useUiStore.getState().scope).toBe('all');
    expect(useUiStore.getState().folder).toEqual(INBOX);

    release(4);
    release(4);
    release(4);
    expect(useUiStore.getState().folder).toEqual(SENT);
  });
});

// @vitest-environment jsdom
import './support/node-abort-globals';
import { AccountIdSchema } from '@relay/shared';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectScope } from '../../src/renderer/src/features/mail/navigation';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { resetStores } from '../../src/renderer/test/support/render-app';
import { composeSender, renderTrayDesktop, startTrayDesktop } from './support/tray-desktop';

const WORK = AccountIdSchema.parse('acc-efa');
const FREELANCE = AccountIdSchema.parse('acc-fl');

describe('tray menu commands in the renderer', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('reports its accounts and active scope to the main process', async () => {
    const { view } = await renderTrayDesktop(startTrayDesktop());
    await waitFor(() => {
      expect(view.accounts().map((account) => account.id)).toContain(FREELANCE);
    });
    expect(view.accounts().find((account) => account.id === FREELANCE)).toMatchObject({
      displayName: 'Freelance',
      email: 'meno@studio.sk',
    });
    expect(view.scope()).toBe('all');
    act(() => {
      selectScope(FREELANCE);
    });
    await waitFor(() => {
      expect(view.scope()).toBe(FREELANCE);
    });
  });

  it('switches to the account picked in the tray and reports it back', async () => {
    const { menuCommands, view } = await renderTrayDesktop(startTrayDesktop());
    act(() => {
      menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    });
    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe(FREELANCE);
    });
    await waitFor(() => {
      expect(view.scope()).toBe(FREELANCE);
    });
  });

  it('opens a new message and the asked settings section', async () => {
    const { menuCommands } = await renderTrayDesktop(startTrayDesktop());
    act(() => {
      menuCommands.request({ command: 'open-settings', section: 'notifications' });
    });
    await waitFor(() => {
      expect(useUiStore.getState().overlay).toEqual({
        kind: 'settings',
        section: 'notifications',
        adding: false,
      });
    });
    act(() => {
      menuCommands.request({ command: 'compose' });
    });
    await waitFor(() => {
      expect(useUiStore.getState().overlay).toEqual({ kind: 'compose', init: {}, scope: 'all' });
    });
  });

  it('keeps a message being written when the tray asks for settings or compose', async () => {
    const { menuCommands, delivered } = await renderTrayDesktop(startTrayDesktop());
    const writing = { kind: 'compose', init: { subject: 'Rozpísané' }, scope: 'all' } as const;
    act(() => {
      setUi({ overlay: writing });
    });
    act(() => {
      menuCommands.request({ command: 'open-settings', section: 'accounts' });
      menuCommands.request({ command: 'compose' });
    });
    await waitFor(() => {
      expect(delivered).toEqual([
        { command: 'open-settings', section: 'accounts' },
        { command: 'compose' },
      ]);
    });
    expect(useUiStore.getState().overlay).toEqual(writing);
  });

  it('keeps the sender of an open message when the tray switches the account', async () => {
    const { menuCommands } = await renderTrayDesktop(startTrayDesktop());
    act(() => {
      selectScope(WORK);
    });
    act(() => {
      menuCommands.request({ command: 'compose' });
    });
    expect(await composeSender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
    act(() => {
      menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    });
    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe(FREELANCE);
    });
    expect(await composeSender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
  });

  it('applies an account and a new message picked before the window listened', async () => {
    const desktop = startTrayDesktop();
    desktop.menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    desktop.menuCommands.request({ command: 'compose' });
    await renderTrayDesktop(desktop);
    await waitFor(() => {
      expect(desktop.delivered).toEqual([
        { command: 'select-scope', scope: FREELANCE },
        { command: 'compose' },
      ]);
    });
    expect(useUiStore.getState().scope).toBe(FREELANCE);
    expect(await composeSender()).toBe('Od: Freelance, meno@studio.sk. Zmeniť účet');
  });

  it('keeps the sender picked when compose was asked even if the account changes before boot ends', async () => {
    const desktop = startTrayDesktop();
    desktop.menuCommands.request({ command: 'select-scope', scope: WORK });
    desktop.menuCommands.request({ command: 'compose' });
    desktop.menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    await renderTrayDesktop(desktop);
    await waitFor(() => {
      expect(desktop.delivered).toHaveLength(3);
    });
    expect(useUiStore.getState().scope).toBe(FREELANCE);
    expect(await composeSender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
  });
});

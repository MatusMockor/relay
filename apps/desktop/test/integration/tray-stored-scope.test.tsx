// @vitest-environment jsdom
import './support/node-abort-globals';
import { AccountIdSchema } from '@relay/shared';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../src/renderer/src/session/session-store';
import { useUiStore } from '../../src/renderer/src/state/ui-store';
import { gate } from '../../src/renderer/test/features-support';
import { resetStores } from '../../src/renderer/test/support/render-app';
import {
  composeSender,
  renderTrayDesktop,
  startTrayDesktop,
  type TrayDesktop,
} from './support/tray-desktop';

const SCOPE_KEY = 'relay.scope';
const WORK = AccountIdSchema.parse('acc-efa');
const FREELANCE = AccountIdSchema.parse('acc-fl');

const bootAfterDelivery = async (desktop: TrayDesktop): Promise<void> => {
  const booted = gate();
  const shown = renderTrayDesktop({
    ...desktop,
    platform: {
      ...desktop.platform,
      deviceSettings: async () => {
        await booted.wait();
        return desktop.platform.deviceSettings();
      },
    },
  });
  await waitFor(() => {
    expect(desktop.delivered).toHaveLength(1);
  });
  expect(useSessionStore.getState().phase).toBe('booting');
  booted.open();
  await shown;
};

describe('tray commands asked while the remembered account is restored', () => {
  beforeEach(() => {
    resetStores();
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(FREELANCE));
  });

  afterEach(() => {
    resetStores();
  });

  it('writes a new message from the remembered account when compose was asked during boot', async () => {
    const desktop = startTrayDesktop();
    desktop.menuCommands.request({ command: 'compose' });

    await bootAfterDelivery(desktop);

    expect(desktop.delivered).toEqual([{ command: 'compose' }]);
    expect(useUiStore.getState().scope).toBe(FREELANCE);
    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'compose', scope: FREELANCE });
    expect(await composeSender()).toBe('Od: Freelance, meno@studio.sk. Zmeniť účet');
  });

  it('falls back to all accounts in a message asked during boot when the remembered account is gone', async () => {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(AccountIdSchema.parse('acc-gone')));
    const desktop = startTrayDesktop();
    desktop.menuCommands.request({ command: 'compose' });

    await bootAfterDelivery(desktop);

    await waitFor(() => {
      expect(useUiStore.getState().overlay).toMatchObject({ kind: 'compose', scope: 'all' });
    });
    expect(useUiStore.getState().scope).toBe('all');
    expect(await composeSender()).toMatch(/^Od: .+@/);
  });

  it('keeps and remembers the account picked in the tray during boot', async () => {
    const desktop = startTrayDesktop();
    desktop.menuCommands.request({ command: 'select-scope', scope: WORK });

    await bootAfterDelivery(desktop);

    expect(desktop.delivered).toEqual([{ command: 'select-scope', scope: WORK }]);
    expect(useUiStore.getState().scope).toBe(WORK);
    expect(window.localStorage.getItem(SCOPE_KEY)).toBe(JSON.stringify(WORK));
  });
});

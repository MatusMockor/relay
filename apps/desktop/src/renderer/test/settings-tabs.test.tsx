// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SettingsSection, setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openSettings = async (section: SettingsSection, adding = false) => {
  const client = demoClient();
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section, adding } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

describe('settings sections as tabs', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('links the selected section tab to the settings panel', async () => {
    const sheet = await openSettings('accounts');
    const tablist = within(sheet).getByRole('tablist', { name: 'Sekcie nastavení' });
    const tab = within(tablist).getByRole('tab', { name: 'Účty' });

    expect(tablist.getAttribute('aria-orientation')).toBe('vertical');
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.tabIndex).toBe(0);
    expect(within(tablist).getByRole('tab', { name: 'Server' }).tabIndex).toBe(-1);
    const panel = within(sheet).getByRole('tabpanel', { name: 'Účty' });
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('moves between visible sections with the arrow keys', async () => {
    const sheet = await openSettings('accounts');
    const tablist = within(sheet).getByRole('tablist', { name: 'Sekcie nastavení' });

    act(() => {
      fireEvent.keyDown(within(tablist).getByRole('tab', { name: 'Účty' }), { key: 'ArrowDown' });
    });

    const next = within(tablist).getByRole('tab', { name: 'Split Inbox' });
    expect(next.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(next);
    expect(within(sheet).getByRole('tabpanel', { name: 'Split Inbox' })).toBeDefined();

    act(() => {
      fireEvent.keyDown(next, { key: 'End' });
    });

    expect(document.activeElement).toBe(within(tablist).getByRole('tab', { name: 'O aplikácii' }));
  });

  it('renders settings groups as level three headings', async () => {
    const sheet = await openSettings('look');

    expect(within(sheet).getByRole('heading', { level: 3, name: 'Toto zariadenie' })).toBeDefined();
  });

  it('hides the Esc close hint while an account is being added', async () => {
    const sheet = await openSettings('accounts', true);
    const close = within(sheet).getByRole('button', { name: 'Zavrieť nastavenia' });

    expect(close.parentElement?.textContent).not.toContain('Esc');

    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
    });

    expect(close.parentElement?.textContent).toContain('Esc');
  });
});

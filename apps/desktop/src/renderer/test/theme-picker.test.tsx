// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { setUi } from '../src/state/ui-store';
import { bootTheme } from '../src/theme/boot-theme';
import { createDocumentThemeController } from '../src/theme/document-theme';
import { demoClient } from './features-support';
import { renderApp, resetStores, storageWith } from './support/render-app';

const openLook = async (theme: 'dark' | 'paper' = 'dark') => {
  const client = demoClient();
  const platform = createBrowserPlatform(storageWith({ mode: 'local', theme }));
  const controller = createDocumentThemeController();
  bootTheme(controller, '', platform);
  renderApp({ platform, demo: () => client, theme: controller });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'look', adding: false } });
  });
  const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
  return { platform, picker: within(sheet).getByRole('radiogroup', { name: 'Farebná téma' }) };
};

const checkedName = (picker: HTMLElement) =>
  within(picker)
    .getAllByRole('radio')
    .find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent;

describe('theme picker', () => {
  beforeEach(() => {
    resetStores();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    resetStores();
    delete document.documentElement.dataset.theme;
  });

  it('offers every theme and starts on the one stored for this device', async () => {
    const { picker } = await openLook('paper');

    expect(
      within(picker)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Podľa systému', 'Tmavá', 'Svetlá', 'Čierna', 'Šerá', 'Papier']);
    await waitFor(() => {
      expect(checkedName(picker)).toBe('Papier');
    });
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(within(picker).getByRole('radio', { name: 'Papier' }).tabIndex).toBe(0);
    expect(within(picker).getByRole('radio', { name: 'Tmavá' }).tabIndex).toBe(-1);
  });

  it('applies a picked theme at once and keeps it for the device', async () => {
    const { platform, picker } = await openLook();

    act(() => {
      fireEvent.click(within(picker).getByRole('radio', { name: 'Svetlá' }));
    });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(checkedName(picker)).toBe('Svetlá');
    await waitFor(async () => {
      expect((await platform.deviceSettings()).theme).toBe('light');
    });
  });

  it('moves the selection with the arrow keys', async () => {
    const { platform, picker } = await openLook();
    const dark = within(picker).getByRole('radio', { name: 'Tmavá' });

    act(() => {
      fireEvent.keyDown(dark, { key: 'ArrowRight' });
    });

    const light = within(picker).getByRole('radio', { name: 'Svetlá' });
    expect(light.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(light);

    act(() => {
      fireEvent.keyDown(light, { key: 'End' });
    });

    expect(checkedName(picker)).toBe('Papier');
    expect(document.documentElement.dataset.theme).toBe('paper');
    await waitFor(async () => {
      expect((await platform.deviceSettings()).theme).toBe('paper');
    });
  });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetStores } from './support/render-app';
import {
  ACME_JIRA,
  ACME_LINEAR,
  resetWithSidebar,
  settingsSheet,
  sidebar,
  sidebarItem,
  taskSystemClient,
} from './support/task-systems';

describe('task systems in the sidebar', () => {
  beforeEach(resetWithSidebar);
  afterEach(resetStores);

  it('lists a connected Jira under its own section with the count of open tasks', async () => {
    renderApp({ demo: () => taskSystemClient() });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    expect(await within(sidebar()).findByRole('button', { name: 'Task systémy' })).toBeDefined();
    await waitFor(() => {
      expect(sidebarItem(ACME_JIRA)?.querySelector('.n')?.textContent).toBe('8');
    });
    expect(within(sidebar()).getByRole('button', { name: 'Pripojiť systém' })).toBeDefined();
  });

  it('lists a connected Linear next to Jira with its own mark and count', async () => {
    renderApp({ demo: () => taskSystemClient() });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    await waitFor(() => {
      expect(sidebarItem(ACME_LINEAR)?.querySelector('.n')?.textContent).toBe('5');
    });
    expect(sidebarItem(ACME_LINEAR)?.querySelector('.ts-mark-linear')).not.toBeNull();
    expect(sidebarItem(ACME_JIRA)?.querySelector('.ts-mark-jira')).not.toBeNull();
  });

  it('hides the section when no task system is connected', async () => {
    renderApp({ demo: () => taskSystemClient({ connected: false }) });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(sidebar()).queryByRole('button', { name: 'Task systémy' })).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: 'Pripojiť systém' })).toBeNull();
  });

  it('marks a connection whose token was rejected and shows no count', async () => {
    renderApp({ demo: () => taskSystemClient({ tokenRejected: true }) });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    await waitFor(() => {
      expect(within(sidebar()).getAllByRole('img', { name: 'Chyba pripojenia' })).toHaveLength(2);
    });
    expect(sidebarItem(ACME_JIRA)?.querySelector('.n')).toBeNull();
    expect(sidebarItem(ACME_LINEAR)?.querySelector('.n')).toBeNull();
  });

  it('opens the connect form in settings from the sidebar', async () => {
    renderApp({ demo: () => taskSystemClient() });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const add = await within(sidebar()).findByRole('button', { name: 'Pripojiť systém' });

    act(() => {
      fireEvent.click(add);
    });

    const sheet = settingsSheet();
    expect(
      within(sheet)
        .getByRole('tab', { name: /Task systémy/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(within(sheet).getByRole('form', { name: 'Pripojiť task systém' })).toBeDefined();
  });
});

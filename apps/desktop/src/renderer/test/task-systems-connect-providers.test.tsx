// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { press } from './features-support';
import { resetStores } from './support/render-app';
import {
  ACME_LINEAR,
  expectField,
  renderWithLinks,
  resetWithSidebar,
  settingsSheet,
  sidebarItem,
  taskSystemClient,
} from './support/task-systems';

const openForm = async (client: MailClient): Promise<{ form: HTMLElement; opened: string[] }> => {
  const opened = renderWithLinks(client);
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'taskSystems', adding: false } });
  });
  const form = await within(settingsSheet()).findByRole('form', { name: 'Pripojiť task systém' });
  return { form, opened };
};

const pick = (form: HTMLElement, provider: string) => {
  act(() => {
    fireEvent.click(within(form).getByRole('radio', { name: provider }));
  });
};

const fill = (form: HTMLElement, label: string, value: string) => {
  act(() => {
    fireEvent.change(within(form).getByLabelText(label), { target: { value } });
  });
};

const submit = (form: HTMLElement) => {
  act(() => {
    fireEvent.click(within(form).getByRole('button', { name: 'Pripojiť' }));
  });
};

describe('connecting Linear and GitHub Issues', () => {
  beforeEach(resetWithSidebar);
  afterEach(resetStores);

  it('asks Linear only for an API key and links to the Linear settings', async () => {
    const { form, opened } = await openForm(taskSystemClient({ connected: false }));

    pick(form, 'Linear');

    expect(within(form).queryByLabelText('URL webu')).toBeNull();
    expect(within(form).queryByLabelText('E-mail')).toBeNull();
    expect(within(form).getByText(/Security & access > Personal API keys/)).toBeDefined();
    submit(form);
    expect(within(form).getByText('Zadaj API kľúč')).toBeDefined();
    act(() => {
      fireEvent.click(within(form).getByRole('button', { name: 'nastaveniach Linear' }));
    });
    expect(opened).toEqual(['https://linear.app/settings/account/security']);
  });

  it('connects Linear and labels it with the organization', async () => {
    const { form } = await openForm(taskSystemClient({ connected: false }));

    pick(form, 'Linear');
    fill(form, 'API kľúč', 'lin_api_123');
    submit(form);

    const row = await within(settingsSheet()).findByRole('region', { name: 'Linear Acme' });
    expect(within(row).getByText(/https:\/\/linear\.app\/acme/)).toBeDefined();
    press('Escape');
    await waitFor(() => {
      expect(sidebarItem('Acme')?.querySelector('.n')?.textContent).toBe('5');
    });
  });

  it('asks GitHub for a personal access token with the needed permission', async () => {
    const { form, opened } = await openForm(taskSystemClient({ connected: false }));

    pick(form, 'GitHub Issues');
    submit(form);

    expect(within(form).getByText('Zadaj personal access token')).toBeDefined();
    expect(within(form).getByText(/Issues: Read-only/)).toBeDefined();
    act(() => {
      fireEvent.click(within(form).getByRole('button', { name: 'nastaveniach GitHubu' }));
    });
    expect(opened).toEqual(['https://github.com/settings/personal-access-tokens']);

    fill(form, 'Personal access token', 'github_pat_1');
    fill(form, 'Názov', 'Môj GitHub');
    submit(form);

    const row = await within(settingsSheet()).findByRole('region', {
      name: 'GitHub Issues Môj GitHub',
    });
    expect(within(row).getByText(/https:\/\/github\.com/)).toBeDefined();
  });

  it('shows the error from GitHub when the token is rejected', async () => {
    const { form } = await openForm(taskSystemClient({ connected: false, tokenRejected: true }));

    pick(form, 'GitHub Issues');
    fill(form, 'Personal access token', 'github_pat_1');
    submit(form);

    expect((await within(form).findByRole('alert')).textContent).toContain('GitHub odmietol token');
  });

  it('reconnects a failing Linear with the Linear form', async () => {
    renderWithLinks(taskSystemClient({ tokenRejected: true }));
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      fireEvent.click(sidebarItem(ACME_LINEAR) ?? document.body);
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Linear odmietol API kľúč/)).toBeDefined();
    act(() => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Znova pripojiť' }));
    });

    const form = within(settingsSheet()).getByRole('form', { name: 'Pripojiť task systém' });
    expect(within(form).getByRole('radio', { name: 'Linear' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(within(form).getByLabelText('API kľúč')).toBeDefined();
    expectField(form, 'Názov', ACME_LINEAR);
  });
});

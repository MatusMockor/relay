// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { press } from './features-support';
import { resetStores } from './support/render-app';
import {
  ACME_JIRA,
  renderWithLinks,
  resetWithSidebar,
  settingsSheet,
  sidebar,
  sidebarItem,
  taskSystemClient,
} from './support/task-systems';

const TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

const openSection = async (client: MailClient): Promise<string[]> => {
  const opened = renderWithLinks(client);
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'taskSystems', adding: false } });
  });
  return opened;
};

const connectForm = (): Promise<HTMLElement> =>
  within(settingsSheet()).findByRole('form', { name: 'Pripojiť task systém' });

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

const fillJira = (form: HTMLElement, siteUrl: string) => {
  fill(form, 'URL webu', siteUrl);
  fill(form, 'E-mail', 'ja@firma.sk');
  fill(form, 'API token', 'token-123');
};

const closeSettings = () => {
  press('Escape');
};

describe('task systems settings', () => {
  beforeEach(resetWithSidebar);
  afterEach(resetStores);

  it('validates the connect form before talking to Jira', async () => {
    await openSection(taskSystemClient({ connected: false }));
    const form = await connectForm();

    submit(form);

    expect(within(form).getByText(/Zadaj adresu webu/)).toBeDefined();
    expect(within(form).getByText('Zadaj platný e-mail')).toBeDefined();
    expect(within(form).getByText('Zadaj API token')).toBeDefined();
    expect(within(form).getByLabelText('URL webu').getAttribute('aria-invalid')).toBe('true');

    fillJira(form, 'http://firma.atlassian.net');
    submit(form);

    expect(within(form).getByText('Adresa musí začínať https://')).toBeDefined();
    expect(within(form).queryByText('Zadaj API token')).toBeNull();
  });

  it('offers Jira and marks the other providers as coming soon', async () => {
    const opened = await openSection(taskSystemClient({ connected: false }));
    const form = await connectForm();
    const providers = within(form).getByRole('radiogroup', { name: 'Systém' });

    expect(
      within(providers).getByRole('radio', { name: /Jira/ }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(within(providers).getByRole('radio', { name: /Linear čoskoro/ })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(providers).getByRole('radio', { name: /GitHub Issues čoskoro/ })).toHaveProperty(
      'disabled',
      true,
    );
    act(() => {
      fireEvent.click(within(form).getByRole('button', { name: 'nastaveniach účtu Atlassian' }));
    });
    expect(opened).toEqual([TOKENS_URL]);
  });

  it('shows the error from Jira when the credentials are rejected', async () => {
    await openSection(taskSystemClient({ connected: false, tokenRejected: true }));
    const form = await connectForm();

    fillJira(form, 'https://firma.atlassian.net');
    submit(form);

    const alert = await within(form).findByRole('alert');
    expect(alert.textContent).toContain('Jira odmietla prihlasovacie údaje');
  });

  it('connects a Jira site and adds it to the list and the sidebar', async () => {
    await openSection(taskSystemClient({ connected: false }));
    const form = await connectForm();

    fillJira(form, 'firma.atlassian.net');
    fill(form, 'Názov', 'Firemná Jira');
    submit(form);

    const row = await within(settingsSheet()).findByRole('region', { name: 'Jira Firemná Jira' });
    expect(within(row).getByText('Pripojené')).toBeDefined();
    expect(within(row).getByText(/https:\/\/firma\.atlassian\.net/)).toBeDefined();
    closeSettings();
    await waitFor(() => {
      expect(sidebarItem('Firemná Jira')?.querySelector('.n')?.textContent).toBe('2');
    });
  });

  it('disconnects a connection after a confirmation', async () => {
    await openSection(taskSystemClient());
    const row = await within(settingsSheet()).findByRole('region', { name: `Jira ${ACME_JIRA}` });

    act(() => {
      fireEvent.click(within(row).getByRole('button', { name: 'Odpojiť' }));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(`Odpojiť ${ACME_JIRA}?`);
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Odpojiť/ }));
    });

    await waitFor(() => {
      expect(
        within(settingsSheet()).queryByRole('region', { name: `Jira ${ACME_JIRA}` }),
      ).toBeNull();
    });
    closeSettings();
    await waitFor(() => {
      expect(within(sidebar()).queryByRole('button', { name: 'Task systémy' })).toBeNull();
    });
  });
});

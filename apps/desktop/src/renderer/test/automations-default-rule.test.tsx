// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const RESTORE = 'Obnoviť predvolené Jira pravidlo';

const openSection = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
  });
  const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
  await within(sheet).findByRole('region', { name: 'Pravidlo Jira tasky' });
  return sheet;
};

const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

const presetsOf = async (client: MailClient) =>
  (await client.listAutomations()).filter((item) => item.preset === 'jiraTasks');

describe('Nastavenia > Automatizácie > predvolené Jira pravidlo', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('removes the default rule with the trash button and restores it', async () => {
    const client = demoClient();
    const sheet = await openSection(client);
    expect(within(sheet).queryByRole('button', { name: RESTORE })).toBeNull();

    click(within(sheet).getByRole('button', { name: 'Odstrániť pravidlo Jira tasky' }));
    await settle();

    expect(await presetsOf(client)).toEqual([]);
    await waitFor(() => {
      expect(within(sheet).queryByRole('region', { name: 'Pravidlo Jira tasky' })).toBeNull();
    });
    click(await within(sheet).findByRole('button', { name: RESTORE }));
    await settle();

    expect(await presetsOf(client)).toEqual([
      expect.objectContaining({ name: 'Jira tasky', enabled: false, accountId: null }),
    ]);
    await within(sheet).findByRole('region', { name: 'Pravidlo Jira tasky' });
    expect(within(sheet).queryByRole('button', { name: RESTORE })).toBeNull();
  });
});

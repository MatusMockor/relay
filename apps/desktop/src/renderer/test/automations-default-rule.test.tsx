// @vitest-environment jsdom
import { waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { click, openAutomations, openRule } from './support/automations';
import { resetStores } from './support/render-app';

const RESTORE = 'Obnoviť predvolené Jira pravidlo';

const presetsOf = async (client: MailClient) =>
  (await client.listAutomations()).filter((item) => item.preset === 'jiraTasks');

describe('Nastavenia > Automatizácie > predvolené Jira pravidlo', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('removes the default rule from its detail and restores it', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    expect(within(sheet).queryByRole('button', { name: RESTORE })).toBeNull();

    click(
      within(openRule(sheet, 'Jira tasky')).getByRole('button', { name: 'Odstrániť pravidlo' }),
    );
    await settle();

    expect(await presetsOf(client)).toEqual([]);
    await waitFor(() => {
      expect(within(sheet).queryByRole('listitem', { name: 'Pravidlo Jira tasky' })).toBeNull();
    });
    click(await within(sheet).findByRole('button', { name: RESTORE }));
    await settle();

    expect(await presetsOf(client)).toEqual([
      expect.objectContaining({ name: 'Jira tasky', enabled: false, accountId: null }),
    ]);
    await within(sheet).findByRole('listitem', { name: 'Pravidlo Jira tasky' });
    expect(within(sheet).queryByRole('button', { name: RESTORE })).toBeNull();
  });
});

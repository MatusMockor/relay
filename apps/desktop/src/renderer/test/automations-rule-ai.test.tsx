// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { change, click, openAutomations, openRule, row, stored } from './support/automations';
import { resetStores } from './support/render-app';

const describeRule = async (region: HTMLElement, sentence: string) => {
  await settle();
  change(within(region).getByLabelText('Opíš pravidlo vlastnými slovami'), sentence);
  click(within(region).getByRole('button', { name: 'Navrhnúť pravidlo' }));
  await settle(40);
};

const summary = (region: HTMLElement): string =>
  within(region).getByRole('region', { name: 'Zhrnutie pravidla' }).textContent;

const explanation = (region: HTMLElement): string =>
  within(within(region).getByRole('region', { name: 'Opíš pravidlo' })).getByRole('status')
    .textContent;

const brokenAi = (): MailClient => {
  const base = demoClient();
  return {
    ...base,
    runAi: (_request, listener) => {
      const timer = setTimeout(() => {
        listener({ type: 'failed', code: 'invalid_output', message: 'schema mismatch' });
      }, 0);
      return () => {
        clearTimeout(timer);
      };
    },
  };
};

describe('Nastavenia > Automatizácie > opis pravidla vlastnými slovami', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('applies the proposal to an existing rule as an unsaved draft and saves it on request', async () => {
    const client = demoClient();
    const expected = await client.previewAutomation({
      accountId: null,
      match: 'all',
      conditions: [{ type: 'fromAddress', address: 'gitlab@firma.sk' }],
      exceptions: [],
    });
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni a archivuj');

    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Od gitlab@firma.sk' });
    expect(explanation(draft)).toContain(
      'Rozumiem: Maily od gitlab@firma.sk: pripnúť, archivovať.',
    );
    expect(summary(draft)).toContain('gitlab@firma.sk');
    expect(within(draft).getByText('Neuložené')).toBeTruthy();
    const preview = within(draft).getByRole('region', { name: 'Náhľad pravidla' });
    await waitFor(() => {
      expect(preview.textContent).toContain(`Zachytí ${String(expected.count)} `);
    });
    expect(await stored(client, 'Tibor')).toMatchObject({
      conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
    });

    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'Tibor')).toBeUndefined();
    expect(await stored(client, 'Od gitlab@firma.sk')).toMatchObject({
      accountId: null,
      conditions: [{ type: 'fromAddress', address: 'gitlab@firma.sk' }],
      actions: [{ type: 'pin' }, { type: 'archive' }],
    });
    expect(within(sheet).queryByText('Neuložené')).toBeNull();
  });

  it('discards the proposal on an existing rule', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Od gitlab@firma.sk' });
    click(within(draft).getByRole('button', { name: 'Zahodiť návrh' }));

    const restored = within(sheet).getByRole('region', { name: 'Pravidlo Tibor' });
    expect(summary(restored)).toContain('tibor@codevo.app');
    expect(within(restored).queryByText('Neuložené')).toBeNull();
    expect(await stored(client, 'Tibor')).toMatchObject({
      actions: [{ type: 'task' }, { type: 'notify' }],
    });
  });

  it('drops an unsaved proposal on an existing rule when the editor is left', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Späť na automatizácie' }));
    });
    await settle();

    expect(row(sheet, 'Tibor')).toBeTruthy();
    expect(
      within(sheet).queryByRole('listitem', { name: 'Pravidlo Od gitlab@firma.sk' }),
    ).toBeNull();
    click(within(row(sheet, 'Tibor')).getByRole('switch', { name: 'Pravidlo Tibor zapnuté' }));
    await settle();
    expect(await stored(client, 'Tibor')).toMatchObject({
      enabled: false,
      conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
    });
  });

  it('leaves out a label the account does not have and says so', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const gitlab = openRule(sheet, 'GitLab do Projektov');

    await describeRule(gitlab, 'od gitlab@firma.sk daj štítok Zmluvy a pripni');

    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Zmluvy' });
    expect(explanation(draft)).toContain('Nepodarilo sa priradiť: štítok „Zmluvy“ (neexistuje)');
    expect(summary(draft)).not.toContain('Zmluvy');
    expect(within(draft).getByRole('checkbox', { name: 'Pripnúť' })).toHaveProperty(
      'checked',
      true,
    );
  });

  it('creates an unsaved rule on the account that has the named label from the templates', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const freelance = (await client.listAccounts()).find(
      (item) => item.displayName === 'Freelance',
    );
    const invoices = (await client.listLabels()).find((label) => label.name === 'Faktúry');
    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));

    await describeRule(sheet, 'faktúry od dodávateľov s prílohou daj do štítku Faktúry a archivuj');

    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Faktúry' });
    expect(explanation(draft)).toContain(
      'Rozumiem: Maily s prílohou: pridať štítok Faktúry, archivovať.',
    );
    expect(explanation(draft)).toContain('Nepodarilo sa priradiť: od dodávateľov');
    expect(summary(draft)).toContain('Freelance');
    expect(within(draft).getByText('Neuložené')).toBeTruthy();
    expect(await stored(client, 'Faktúry')).toBeUndefined();

    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'Faktúry')).toMatchObject({
      accountId: freelance?.id,
      enabled: true,
      conditions: [{ type: 'hasAttachment' }],
      actions: [{ type: 'addLabel', labelId: invoices?.id }, { type: 'archive' }],
    });
  });

  it('describes a new rule from the list', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    click(within(sheet).getByRole('button', { name: 'Opíš nové pravidlo…' }));
    const field = within(sheet).getByLabelText('Opíš pravidlo vlastnými slovami');
    expect(document.activeElement).toBe(field);

    await describeRule(sheet, 'z domény substack.com označ ako prečítané a archivuj');

    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Z domény substack.com' });
    expect(summary(draft)).toContain('substack.com');
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Späť na automatizácie' }));
    });
    expect(row(sheet, 'Z domény substack.com')).toBeTruthy();
    expect(await stored(client, 'Z domény substack.com')).toBeUndefined();
  });

  it('shows a friendly error when the AI answer is not a valid rule', async () => {
    const client = brokenAi();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'urob poriadok');

    expect(within(tibor).getByRole('alert').textContent).toBe(
      'AI nevrátila platný návrh pravidla. Skús pravidlo opísať inak.',
    );
    expect(within(tibor).getByRole('button', { name: 'Navrhnúť pravidlo' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(within(tibor).queryByText('Neuložené')).toBeNull();
  });
});

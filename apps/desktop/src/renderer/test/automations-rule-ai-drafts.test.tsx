// @vitest-environment jsdom
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, heldAi, settle } from './features-support';
import { type Gate, gate } from './support/gate';
import { change, click, condition, openAutomations, openRule, stored } from './support/automations';
import { resetStores } from './support/render-app';

const STALE = 'Pravidlo sa medzitým zmenilo, návrh som nepoužil. Navrhni ho znova.';

const describeRule = async (region: HTMLElement, sentence: string) => {
  await settle();
  change(within(region).getByLabelText('Opíš pravidlo vlastnými slovami'), sentence);
  click(within(region).getByRole('button', { name: 'Navrhnúť pravidlo' }));
  await settle(40);
};

const heldLabels = (base: MailClient, held: Gate): MailClient => ({
  ...base,
  listLabels: async (accountId) => {
    await held.wait();
    return base.listLabels(accountId);
  },
});

const heldAfterFirst = (base: MailClient, held: Gate): MailClient => {
  const later = heldAi(base, held, []);
  const calls = { count: 0 };
  return {
    ...base,
    runAi: (request, listener) => {
      calls.count += 1;
      return (calls.count === 1 ? base : later).runAi(request, listener);
    },
  };
};

const heldSaves = (base: MailClient, held: Gate): MailClient => ({
  ...base,
  replaceAutomations: async (...args: Parameters<MailClient['replaceAutomations']>) => {
    await held.wait();
    return base.replaceAutomations(...args);
  },
});

describe('Nastavenia > Automatizácie > neuložený návrh pravidla', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps edits of a proposal on an existing rule unsaved until the user saves it', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo gitlab@firma.sk' });
    click(within(draft).getByRole('checkbox', { name: 'Archivovať' }));
    await settle();

    expect(within(draft).getByText('Neuložené')).toBeTruthy();
    expect(await stored(client, 'gitlab@firma.sk')).toBeUndefined();
    expect(await stored(client, 'Tibor')).toMatchObject({
      conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
    });

    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'gitlab@firma.sk')).toMatchObject({
      actions: [{ type: 'pin' }, { type: 'archive' }],
    });
  });

  it('keeps edits of a proposed new rule unsaved until the user saves it', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    click(within(sheet).getByRole('button', { name: 'Opíš nové pravidlo…' }));

    await describeRule(sheet, 'z domény substack.com archivuj');
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo substack.com' });
    click(within(draft).getByRole('checkbox', { name: 'Označiť ako prečítané' }));
    await settle();

    expect(await stored(client, 'substack.com')).toBeUndefined();
    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'substack.com')).toMatchObject({
      conditions: [{ type: 'fromDomain', domain: 'substack.com' }],
    });
  });

  it('refuses to save a proposal while an exception is unfinished', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo gitlab@firma.sk' });
    click(within(draft).getByRole('button', { name: '+ Pridať výnimku' }));
    const exception = within(draft).getByRole('group', { name: 'Výnimka 1' });
    const address = within(exception).getByLabelText('Adresa');
    change(address, 'private@');
    act(() => {
      fireEvent.blur(address);
    });
    await settle();

    const save = within(draft).getByRole('button', { name: 'Uložiť pravidlo' });
    expect(save).toHaveProperty('disabled', true);
    expect(within(draft).getByText('Najprv dokonči rozpísané podmienky.')).toBeTruthy();
    click(save);
    await settle();
    expect(await stored(client, 'gitlab@firma.sk')).toBeUndefined();

    change(address, 'private@firma.sk');
    act(() => {
      fireEvent.blur(address);
    });
    await settle();
    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'gitlab@firma.sk')).toMatchObject({
      exceptions: [{ type: 'fromAddress', address: 'private@firma.sk' }],
    });
  });

  it('ignores a late proposal while a condition edit is still open', async () => {
    const held = gate();
    const client = heldAi(demoClient(), held, []);
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk archivuj');
    const address = within(condition(tibor, 1)).getByLabelText('Adresa');
    change(address, 'jana@firma.sk');
    held.open();
    await settle(40);

    const current = within(sheet).getByRole('region', { name: 'Pravidlo Tibor' });
    expect(within(current).getByRole('alert').textContent).toBe(STALE);
    expect(within(condition(current, 1)).getByLabelText('Adresa')).toHaveProperty(
      'value',
      'jana@firma.sk',
    );
    expect(within(current).queryByText('Neuložené')).toBeNull();
  });

  it('refuses to save a proposal while a new exception is left blank', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo gitlab@firma.sk' });
    click(within(draft).getByRole('button', { name: '+ Pridať výnimku' }));
    const save = within(draft).getByRole('button', { name: 'Uložiť pravidlo' });
    expect(save).toHaveProperty('disabled', true);
    click(save);
    await settle();
    expect(await stored(client, 'gitlab@firma.sk')).toBeUndefined();

    click(within(draft).getByRole('button', { name: 'Zrušiť novú výnimku' }));
    click(within(draft).getByRole('button', { name: 'Uložiť pravidlo' }));
    await settle();

    expect(await stored(client, 'gitlab@firma.sk')).toMatchObject({ exceptions: [] });
  });

  it('ignores a late proposal while a condition edit is invalid', async () => {
    const held = gate();
    const client = heldAi(demoClient(), held, []);
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk archivuj');
    change(within(condition(tibor, 1)).getByLabelText('Adresa'), 'jana@');
    held.open();
    await settle(40);

    const current = within(sheet).getByRole('region', { name: 'Pravidlo Tibor' });
    expect(within(current).getByRole('alert').textContent).toBe(STALE);
    expect(within(condition(current, 1)).getByLabelText('Adresa')).toHaveProperty('value', 'jana@');
  });

  it('ignores a late proposal while the rule name is being typed', async () => {
    const held = gate();
    const client = heldAi(demoClient(), held, []);
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk archivuj');
    click(within(tibor).getByRole('button', { name: 'Premenovať pravidlo Tibor' }));
    change(within(tibor).getByLabelText('Názov pravidla'), 'Tibor nové');
    held.open();
    await settle(40);

    const current = within(sheet).getByRole('region', { name: 'Pravidlo Tibor' });
    expect(within(current).getByRole('alert').textContent).toBe(STALE);
    expect(within(current).getByLabelText('Názov pravidla')).toHaveProperty('value', 'Tibor nové');
  });

  it('keeps a proposal that arrives while the previous one is being saved', async () => {
    const ai = gate();
    const saves = gate();
    const client = heldSaves(heldAfterFirst(demoClient(), ai), saves);
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    await describeRule(tibor, 'od gitlab@firma.sk pripni');
    const first = within(sheet).getByRole('region', { name: 'Pravidlo gitlab@firma.sk' });
    await describeRule(first, 'od jana@firma.sk archivuj');
    click(within(first).getByRole('button', { name: 'Uložiť pravidlo' }));
    ai.open();
    await settle(40);
    saves.open();
    await settle(40);

    const second = within(sheet).getByRole('region', { name: 'Pravidlo jana@firma.sk' });
    expect(within(second).getByText('Neuložené')).toBeTruthy();
    expect(await stored(client, 'gitlab@firma.sk')).toMatchObject({ actions: [{ type: 'pin' }] });
  });

  it('waits for the labels before it asks the AI', async () => {
    const held = gate();
    const sheet = await openAutomations(heldLabels(demoClient(), held));
    const tibor = openRule(sheet, 'Tibor');
    change(within(tibor).getByLabelText('Opíš pravidlo vlastnými slovami'), 'archivuj');

    expect(within(tibor).getByRole('button', { name: 'Navrhnúť pravidlo' })).toHaveProperty(
      'disabled',
      true,
    );
    held.open();
    await settle();

    expect(within(tibor).getByRole('button', { name: 'Navrhnúť pravidlo' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, gate, settle } from './features-support';
import { click, openAutomations, stored } from './support/automations';
import { resetStores } from './support/render-app';

const JIRA = 'Úlohy z Jiry';

const release = (button: number): void => {
  act(() => {
    fireEvent.mouseUp(window, { button });
  });
};

const pickTemplate = (sheet: HTMLElement, title: string): void => {
  click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
  click(within(sheet).getByRole('button', { name: `Šablóna ${title}` }));
};

const detail = (name: string): HTMLElement | null =>
  screen.queryByRole('region', { name: `Pravidlo ${name}` });

const heldSaves = () => {
  const base = demoClient();
  const held = gate();
  const client: MailClient = {
    ...base,
    replaceAutomations: (inputs) => held.wait().then(() => base.replaceAutomations(inputs)),
  };
  return { client, held };
};

describe('history of new automation drafts', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('opens the saved rule going forward after leaving its draft before the save', async () => {
    const { client, held } = heldSaves();
    const sheet = await openAutomations(client);
    pickTemplate(sheet, JIRA);
    expect(detail(JIRA)).not.toBeNull();

    release(3);
    act(() => {
      held.open();
    });
    await settle();
    expect(await stored(client, JIRA)).toBeDefined();
    release(4);

    expect(detail(JIRA)).not.toBeNull();
  });

  it('opens the saved rule going back after the settings closed before the save', async () => {
    const { client, held } = heldSaves();
    const sheet = await openAutomations(client);
    pickTemplate(sheet, JIRA);
    click(within(sheet).getByRole('button', { name: 'Zavrieť nastavenia' }));
    expect(screen.queryByRole('dialog', { name: 'Nastavenia' })).toBeNull();

    act(() => {
      held.open();
    });
    await settle();
    expect(await stored(client, JIRA)).toBeDefined();
    release(3);

    expect(detail(JIRA)).not.toBeNull();
  });

  it('never opens a newer draft from the history entry of an older one', async () => {
    const sheet = await openAutomations(demoClient());
    pickTemplate(sheet, 'Upratať newslettre');
    expect(detail('Newslettre')).not.toBeNull();
    click(within(sheet).getByRole('tab', { name: 'Vzhľad' }));
    release(3);
    expect(detail('Newslettre')).toBeNull();
    pickTemplate(sheet, 'Prázdne pravidlo');
    expect(detail('Nové pravidlo')).not.toBeNull();

    release(3);
    release(3);

    expect(detail('Nové pravidlo')).toBeNull();
    expect(within(sheet).getByRole('list', { name: 'Pravidlá' })).toBeDefined();
  });
});

// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import { change, click, condition, openAutomations, openRule, stored } from './support/automations';
import { resetStores } from './support/render-app';

const enter = (element: HTMLElement) => {
  act(() => {
    fireEvent.keyDown(element, { key: 'Enter' });
  });
};

const summary = (region: HTMLElement): string =>
  within(region).getByRole('region', { name: 'Zhrnutie pravidla' }).textContent;

const exception = (region: HTMLElement, position: number): HTMLElement =>
  within(region).getByRole('group', { name: `Výnimka ${String(position)}` });

const optionValues = (select: HTMLElement): string[] =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.getAttribute('value') ?? '');

describe('Nastavenia > Automatizácie > editor pravidla', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('switches between all and any conditions with the joiner and the summary', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(tibor, 2)).getByLabelText('Typ podmienky'), 'fromDomain');
    const domain = within(condition(tibor, 2)).getByLabelText('Doména');
    change(domain, 'firma.sk');
    enter(domain);
    await settle();

    expect(within(tibor).getByText('a', { selector: '.au-and' })).toBeDefined();
    expect(summary(tibor)).toBe(
      'Zhrnutie: Keď príde mail od tibor@codevo.app a z domény firma.sk, vytvorí úlohu a pošle notifikáciu.',
    );

    click(within(tibor).getByRole('radio', { name: 'ktorúkoľvek' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.match).toBe('any');
    expect(within(tibor).getByText('alebo', { selector: '.au-and' })).toBeDefined();
    expect(within(tibor).queryByText('a', { selector: '.au-and' })).toBeNull();
    expect(summary(tibor)).toContain('od tibor@codevo.app alebo z domény firma.sk');
    expect(within(tibor).getByRole('radio', { name: 'ktorúkoľvek' })).toHaveProperty(
      'ariaChecked',
      'true',
    );
  });

  it('adds and removes an exception', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(within(tibor).getByRole('button', { name: '+ Pridať výnimku' }));
    const address = within(exception(tibor, 1)).getByLabelText('Adresa');
    change(address, 'noreply@codevo.app');
    enter(address);
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
      exceptions: [{ type: 'fromAddress', address: 'noreply@codevo.app' }],
    });
    expect(summary(tibor)).toContain('okrem mailov od noreply@codevo.app');

    click(within(tibor).getByRole('button', { name: 'Odstrániť výnimku od noreply@codevo.app' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.exceptions).toEqual([]);
    expect(within(tibor).queryByRole('group', { name: 'Výnimka 1' })).toBeNull();
    expect(summary(tibor)).not.toContain('okrem');
  });

  it('offers regular expressions only under Pokročilé', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    const types = optionValues(within(condition(tibor, 1)).getByLabelText('Typ podmienky'));

    expect(types).toContain('subjectContains');
    expect(types).not.toContain('subjectRegex');
    expect(types).not.toContain('header');
    const toggle = within(tibor).getByRole('button', { name: 'Pokročilé' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      within(tibor).queryByRole('button', { name: '+ Predmet podľa regulárneho výrazu' }),
    ).toBeNull();

    click(toggle);
    click(within(tibor).getByRole('button', { name: '+ Predmet podľa regulárneho výrazu' }));
    const regexRow = condition(tibor, 2);
    expect(within(regexRow).getByLabelText('Typ podmienky')).toHaveProperty(
      'value',
      'subjectRegex',
    );
    const pattern = within(regexRow).getByLabelText('Obsahuje (regulárny výraz)');
    change(pattern, '^ponuka');
    enter(pattern);
    await settle();

    expect((await stored(client, 'Tibor'))?.conditions).toEqual([
      { type: 'fromAddress', address: 'tibor@codevo.app' },
      { type: 'subjectRegex', pattern: '^ponuka', caseSensitive: false },
    ]);
    expect(optionValues(within(condition(tibor, 2)).getByLabelText('Typ podmienky'))).toContain(
      'header',
    );

    click(within(tibor).getByRole('radio', { name: 'Okrem' }));
    click(within(tibor).getByRole('button', { name: '+ Predmet podľa regulárneho výrazu' }));
    const regexException = exception(tibor, 1);
    expect(within(regexException).getByLabelText('Typ podmienky')).toHaveProperty(
      'value',
      'subjectRegex',
    );
    const exceptionPattern = within(regexException).getByLabelText('Obsahuje (regulárny výraz)');
    change(exceptionPattern, 'newsletter');
    enter(exceptionPattern);
    await settle();

    expect((await stored(client, 'Tibor'))?.exceptions).toEqual([
      { type: 'subjectRegex', pattern: 'newsletter', caseSensitive: false },
    ]);
  });

  it('keeps an unsaved row when an advanced condition is requested for its section', async () => {
    const sheet = await openAutomations(demoClient());
    const tibor = openRule(sheet, 'Tibor');
    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(tibor, 2)).getByLabelText('Adresa'), 'rozpisane@firma.sk');
    click(within(tibor).getByRole('button', { name: 'Pokročilé' }));
    const regex = () =>
      within(tibor).getByRole('button', { name: '+ Predmet podľa regulárneho výrazu' });

    expect(regex()).toHaveProperty('disabled', true);
    expect(
      within(tibor).getByText('Najprv dokonči alebo zruš rozpísaný riadok v tejto sekcii.'),
    ).toBeDefined();
    click(regex());
    expect(within(condition(tibor, 2)).getByLabelText('Adresa')).toHaveProperty(
      'value',
      'rozpisane@firma.sk',
    );

    click(within(tibor).getByRole('radio', { name: 'Okrem' }));

    expect(regex()).toHaveProperty('disabled', false);
  });

  it('shows how many recent mails the draft rule would catch', async () => {
    const client = demoClient();
    const expected = await client.previewAutomation({
      accountId: null,
      match: 'all',
      conditions: [{ type: 'fromAddress', address: 'gitlab@firma.sk' }],
      exceptions: [],
    });
    expect(expected.count).toBeGreaterThan(0);
    const sheet = await openAutomations(client);
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    const preview = within(gitlab).getByRole('region', { name: 'Náhľad pravidla' });

    await waitFor(() => {
      expect(preview.textContent).toContain(`Zachytí ${String(expected.count)} `);
    });
    expect(within(preview).getAllByRole('listitem')).toHaveLength(Math.min(expected.count, 5));
    expect(within(preview).getAllByText('GitLab').length).toBeGreaterThan(0);

    click(within(gitlab).getByRole('button', { name: '+ Pridať výnimku' }));
    change(within(exception(gitlab, 1)).getByLabelText('Typ podmienky'), 'fromDomain');
    const domain = within(exception(gitlab, 1)).getByLabelText('Doména');
    change(domain, 'firma.sk');
    enter(domain);

    await waitFor(() => {
      expect(preview.textContent).toContain('Zachytí 0 mailov za posledných 30 dní');
    });
    expect(within(preview).queryByRole('list')).toBeNull();
    expect((await stored(client, 'GitLab do Projektov'))?.exceptions).toEqual([
      { type: 'fromDomain', domain: 'firma.sk' },
    ]);
  });
});

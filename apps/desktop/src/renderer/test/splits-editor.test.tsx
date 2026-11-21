// @vitest-environment jsdom
import { supportedSplits } from '@relay/shared';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import { change, click, condition } from './support/automations';
import { resetStores } from './support/render-app';
import { openSplit, openSplits, splitNames, splitSummary, storedSplit } from './support/splits';

const enter = (element: HTMLElement) => {
  act(() => {
    fireEvent.keyDown(element, { key: 'Enter' });
  });
};

const optionValues = (select: HTMLElement): string[] =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.getAttribute('value') ?? '');

const preview = (region: HTMLElement): HTMLElement =>
  within(region).getByRole('region', { name: 'Náhľad splitu' });

describe('Nastavenia > Split Inbox > editor splitu', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('opens a split from its row and switches the match mode', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);
    const clients = openSplit(sheet, 'Klienti');

    expect(splitSummary(clients)).toBe(
      'Zhrnutie: Do splitu Klienti pôjdu maily z účtu Freelance z domény kaviaren-zrnko.sk alebo z domény atelier-brezina.sk.',
    );

    click(within(clients).getByRole('radio', { name: 'všetky' }));
    await settle();

    expect((await storedSplit(client, 'Klienti'))?.match).toBe('all');
    expect(splitSummary(clients)).toContain(
      'z domény kaviaren-zrnko.sk a z domény atelier-brezina.sk',
    );
  });

  it('adds an exception and shows it in the summary', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);
    const clients = openSplit(sheet, 'Klienti');

    click(within(clients).getByRole('button', { name: '+ Pridať výnimku' }));
    const exception = within(clients).getByRole('group', { name: 'Výnimka 1' });
    change(within(exception).getByLabelText('Typ podmienky'), 'subjectContains');
    const word = within(exception).getByLabelText('Slovo v predmete');
    change(word, 'faktúra');
    enter(word);
    await settle();

    expect((await storedSplit(client, 'Klienti'))?.exceptions).toEqual([
      { type: 'subjectContains', value: 'faktúra' },
    ]);
    expect(splitSummary(clients)).toContain('okrem mailov so slovom „faktúra“ v predmete');
  });

  it('never offers Jira events as a split condition', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);
    const jira = openSplit(sheet, 'Jira');
    click(within(jira).getByRole('button', { name: '+ Pridať výnimku' }));

    const types = optionValues(within(condition(jira, 1)).getByLabelText('Typ podmienky'));
    const exceptionTypes = optionValues(
      within(within(jira).getByRole('group', { name: 'Výnimka 1' })).getByLabelText(
        'Typ podmienky',
      ),
    );

    expect(types).toContain('jira');
    expect(types).not.toContain('jiraEvent');
    expect(exceptionTypes).toContain('hasAttachment');
    expect(exceptionTypes).not.toContain('jiraEvent');
  });

  it('previews the threads of the last 30 days and warns about an earlier split', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);
    const other = openSplit(sheet, 'Ostatné');

    click(within(other).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(other, 3)).getByLabelText('Typ podmienky'), 'fromDomain');
    const domain = within(condition(other, 3)).getByLabelText('Doména');
    change(domain, 'kaviaren-zrnko.sk');
    enter(domain);

    await waitFor(() => {
      expect(
        within(preview(other)).getByText(/zachytí aj split Klienti, ktorý je vyššie\.$/),
      ).toBeDefined();
    });
    expect(within(preview(other)).getByText(/^Zachytí \d+ mail/)).toBeDefined();
  });

  it('reorders splits with Alt and arrows', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);

    act(() => {
      fireEvent.keyDown(within(sheet).getByRole('button', { name: 'Presunúť split Jira' }), {
        key: 'ArrowDown',
        altKey: true,
      });
    });
    await settle();

    const stored = supportedSplits(await client.listSplits());
    expect(stored.map((split) => [split.name, split.order])).toEqual([
      ['Klienti', 0],
      ['Jira', 1],
      ['Ostatné', 2],
    ]);
    expect(splitNames(sheet)).toEqual(['Split Klienti', 'Split Jira', 'Split Ostatné']);
  });

  it('opens a quickly added split in the editor', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);

    change(within(sheet).getByLabelText('Nový split'), 'Dodávatelia');
    change(within(sheet).getByLabelText('Doména'), 'dodavatel.sk');
    click(within(sheet).getByRole('button', { name: 'Pridať split' }));

    const region = await within(sheet).findByRole('region', { name: 'Split Dodávatelia' });
    expect(splitSummary(region)).toBe(
      'Zhrnutie: Do splitu Dodávatelia pôjdu maily z domény dodavatel.sk.',
    );
    click(within(region).getByRole('button', { name: 'Späť na splity' }));
    expect(splitNames(sheet)).toContain('Split Dodávatelia');
  });

  it('keeps a split without conditions unsaved with a hint', async () => {
    const client = demoClient();
    const sheet = await openSplits(client);
    const jira = openSplit(sheet, 'Jira');

    click(within(jira).getByRole('button', { name: /^Odstrániť podmienku/ }));
    await settle();

    expect(
      within(jira).getByText('Pridaj aspoň jednu podmienku, potom sa split uloží.'),
    ).toBeDefined();
    expect((await storedSplit(client, 'Jira'))?.rules).toHaveLength(1);
  });
});

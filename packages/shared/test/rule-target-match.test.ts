import { describe, expect, it } from 'vitest';
import { findTarget, foldName, mentionsName, spokenMatch } from '../src/domain';

const targets = [
  { id: 'a', name: 'Faktúry' },
  { id: 'b', name: 'Klienti/Acme' },
  { id: 'c', name: 'Projekty / Alfa' },
  { id: 'd', name: 'Projekty / Beta' },
  { id: 'e', name: 'Cestovanie/Taliansko 2026' },
  { id: 'f', name: 'INBOX / Zákazky / Čajovňa' },
  { id: 'g', name: 'Archív / Gama' },
];

const found = (query: string, list = targets): string | null => {
  const match = findTarget(list, query);
  return match.kind === 'found' ? match.target.id : null;
};

describe('rule target names', () => {
  it('folds case, diacritics and spacing', () => {
    expect(foldName('  Čajovňa   Pod  Lipou ')).toBe('cajovna pod lipou');
  });

  it.each([
    ['Faktúry', 'a'],
    ['faktury', 'a'],
    ['„Faktúry“', 'a'],
    ['Faktúra', 'a'],
    ['klienti / acme', 'b'],
    ['Acme', 'b'],
    ['Projekty/Alfa', 'c'],
    ['beta', 'd'],
    ['taliansko 2026', 'e'],
    ['Zákazky/Čajovňa', 'f'],
    ['Klienti/Acmeho', 'b'],
  ])('resolves %s', (query, id) => {
    expect(found(query)).toBe(id);
  });

  it.each(['Projekty', 'Účtovníctvo', 'Fa', '', '„“'])('leaves %s unresolved', (query) => {
    expect(findTarget(targets, query)).toEqual({ kind: 'none' });
  });

  it('never falls back to another folder with the same leaf when a path is given', () => {
    expect(findTarget(targets, 'Projekty/Gama')).toEqual({ kind: 'none' });
    expect(found('Gama')).toBe('g');
  });

  it('reports names that fold to the same key or stem as ambiguous', () => {
    const accounts = [
      { id: 'x', name: 'Účty' },
      { id: 'y', name: 'Ucty' },
    ];
    const contracts = [
      { id: 'x', name: 'Zmluvy' },
      { id: 'y', name: 'Zmluva' },
    ];

    expect(findTarget(accounts, 'účty')).toEqual({ kind: 'ambiguous' });
    expect(findTarget(contracts, 'Zmluv')).toEqual({ kind: 'ambiguous' });
    expect(found('zmluvy', contracts)).toBe('x');
  });

  it('checks that the sentence names a target', () => {
    expect(mentionsName('daj do štítku Faktúr', 'Faktúry')).toBe(true);
    expect(mentionsName('presuň do Taliansko 2026', 'Cestovanie/Taliansko 2026')).toBe(true);
    expect(mentionsName('daj do štítku Faktúry', 'Zmluvy')).toBe(false);
    expect(mentionsName('daj do štítku', '„“')).toBe(false);
  });

  it('resolves what the user said and checks that the proposal agrees', () => {
    const spoken = (said: string, proposed: string, list = targets): unknown => {
      const match = spokenMatch(list, [said], proposed);
      return match.kind === 'found' ? match.target.id : match.kind;
    };
    const clients = [
      { id: 'one', name: 'Client' },
      { id: 'many', name: 'Clients' },
    ];
    const work = [
      { id: 'work', name: 'Work/Invoices' },
      { id: 'private', name: 'Private/Invoices' },
    ];

    expect(spoken('projekty/alfa', 'Projekty / Alfa')).toBe('c');
    expect(spoken('taliansko 2026', 'Cestovanie/Taliansko 2026')).toBe('e');
    expect(spoken('clients', 'Client', clients)).toBe('many');
    expect(spoken('my work/invoices', 'Work/Invoices', work)).toBe('none');
    expect(spoken('work/invoices', 'Private/Invoices', work)).toBe('other');
    expect(spoken('invoices', 'Private/Invoices', work)).toBe('ambiguous');
    expect(spoken('projects right away', 'Projects', [{ id: 'p', name: 'Projects' }])).toBe('p');
  });
});

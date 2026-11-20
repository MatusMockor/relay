import { describe, expect, it } from 'vitest';
import { findTarget, foldName } from '../src/domain';

const targets = [
  { id: 'a', name: 'Faktúry' },
  { id: 'b', name: 'Klienti/Acme' },
  { id: 'c', name: 'Projekty / Alfa' },
  { id: 'd', name: 'Projekty / Beta' },
  { id: 'e', name: 'Cestovanie/Taliansko 2026' },
];

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
  ])('resolves %s', (query, id) => {
    expect(findTarget(targets, query)?.id).toBe(id);
  });

  it.each(['Projekty', 'Účtovníctvo', 'Fa', '', '„“'])('leaves %s unresolved', (query) => {
    expect(findTarget(targets, query)).toBeNull();
  });

  it('refuses a stem that fits more than one target', () => {
    const similar = [
      { id: 'x', name: 'Zmluvy' },
      { id: 'y', name: 'Zmluva' },
    ];

    expect(findTarget(similar, 'Zmluv')).toBeNull();
    expect(findTarget(similar, 'zmluvy')?.id).toBe('x');
  });
});

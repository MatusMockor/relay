import { describe, expect, it } from 'vitest';
import { NavigationHistory } from '../src/features/history/navigation-history';

const visited = (...entries: string[]): NavigationHistory<string> => {
  const history = new NavigationHistory<string>();
  const [first = '', ...rest] = entries;
  history.reset(first);
  rest.forEach((entry) => {
    history.visit(entry);
  });
  return history;
};

const same = (a: string, b: string): boolean => a === b;

describe('navigation history', () => {
  it('moves back and forward along the visited entries', () => {
    const history = visited('a', 'b', 'c');

    expect(history.move('back')).toBe('b');
    expect(history.move('back')).toBe('a');
    expect(history.can('back')).toBe(false);
    expect(history.move('back')).toBeNull();
    expect(history.move('forward')).toBe('b');
    expect(history.move('forward')).toBe('c');
    expect(history.can('forward')).toBe(false);
  });

  it('drops the forward entries when a new entry is visited', () => {
    const history = visited('a', 'b');
    history.move('back');

    history.visit('c');

    expect(history.can('forward')).toBe(false);
    expect(history.move('back')).toBe('a');
  });

  it('keeps only the newest entries up to its limit', () => {
    const history = new NavigationHistory<number>(3);
    history.reset(1);
    [2, 3, 4, 5, 6].forEach((entry) => {
      history.visit(entry);
    });

    expect(history.move('back')).toBe(5);
    expect(history.move('back')).toBe(4);
    expect(history.move('back')).toBe(3);
    expect(history.move('back')).toBeNull();
  });

  it('replaces only the current entry', () => {
    const history = visited('a', 'b');

    history.replaceCurrent('x');

    expect(history.current()).toBe('x');
    expect(history.move('back')).toBe('a');
  });

  it('rewrites entries anywhere and merges an entry equal to its predecessor', () => {
    const history = visited('a', 'b', 'c', 'd');
    history.move('back');

    history.rewrite((entry) => (entry === 'b' ? 'a' : entry), same);

    expect(history.current()).toBe('c');
    expect(history.move('back')).toBe('a');
    expect(history.can('back')).toBe(false);
    expect(history.move('forward')).toBe('c');
    expect(history.move('forward')).toBe('d');
  });

  it('never merges an entry the rewrite left untouched', () => {
    const history = visited('a', 'a', 'b');

    history.rewrite((entry) => (entry === 'b' ? 'c' : entry), same);

    expect(history.current()).toBe('c');
    expect(history.move('back')).toBe('a');
    expect(history.move('back')).toBe('a');
  });

  it('keeps the merged predecessor current when the current entry is merged', () => {
    const history = visited('a', 'b', 'c');
    history.move('back');

    history.rewrite((entry) => (entry === 'b' ? 'a' : entry), same);

    expect(history.current()).toBe('a');
    expect(history.move('forward')).toBe('c');
  });
});

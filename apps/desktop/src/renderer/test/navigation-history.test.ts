import { describe, expect, it } from 'vitest';
import { NavigationHistory } from '../src/features/history/navigation-history';

describe('navigation history', () => {
  it('moves back and forward between locations', () => {
    const history = new NavigationHistory<string>();
    history.push('a');
    history.push('b');

    expect(history.take('back', 'c')).toBe('b');
    expect(history.take('back', 'b')).toBe('a');
    expect(history.can('back')).toBe(false);
    expect(history.take('back', 'a')).toBeNull();
    expect(history.take('forward', 'a')).toBe('b');
    expect(history.take('forward', 'b')).toBe('c');
    expect(history.can('forward')).toBe(false);
  });

  it('drops the forward locations when a new location is pushed', () => {
    const history = new NavigationHistory<string>();
    history.push('a');
    history.take('back', 'b');
    expect(history.can('forward')).toBe(true);

    history.push('a');

    expect(history.can('forward')).toBe(false);
    expect(history.take('back', 'c')).toBe('a');
  });

  it('keeps only the newest locations up to its limit', () => {
    const history = new NavigationHistory<number>(3);
    [1, 2, 3, 4, 5].forEach((location) => {
      history.push(location);
    });

    expect(history.take('back', 6)).toBe(5);
    expect(history.take('back', 5)).toBe(4);
    expect(history.take('back', 4)).toBe(3);
    expect(history.take('back', 3)).toBeNull();
  });

  it('forgets everything when cleared', () => {
    const history = new NavigationHistory<string>();
    history.push('a');
    history.take('back', 'b');
    history.push('c');

    history.clear();

    expect(history.can('back')).toBe(false);
    expect(history.can('forward')).toBe(false);
  });
});

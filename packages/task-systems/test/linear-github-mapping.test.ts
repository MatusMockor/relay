import { ProviderError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import {
  githubPriorityOf,
  githubStatusOf,
  linearPriorityOf,
  linearStatusCategoryOf,
  nextPageOf,
} from '../src';

describe('Linear priority and status mapping', () => {
  it.each([
    [1, 'urgent'],
    [2, 'high'],
    [3, 'medium'],
    [4, 'low'],
    [0, 'none'],
    [7, 'none'],
    [null, 'none'],
  ] as const)('maps priority %s to %s', (priority, expected) => {
    expect(linearPriorityOf(priority)).toBe(expected);
  });

  it.each([
    ['triage', 'todo'],
    ['backlog', 'todo'],
    ['unstarted', 'todo'],
    ['started', 'inProgress'],
    ['completed', 'done'],
    ['canceled', 'done'],
    ['custom', 'todo'],
    ['constructor', 'todo'],
    ['__proto__', 'todo'],
    [null, 'todo'],
  ] as const)('maps state type %s to %s', (type, category) => {
    expect(linearStatusCategoryOf(type)).toBe(category);
  });
});

describe('GitHub label mapping', () => {
  it.each([
    [['priority: urgent'], 'urgent'],
    [['Priority/Critical'], 'urgent'],
    [['priority-p0'], 'urgent'],
    [['P0'], 'urgent'],
    [['priority:high'], 'high'],
    [['p1'], 'high'],
    [['Priority: Medium'], 'medium'],
    [['P2'], 'medium'],
    [['priority/low'], 'low'],
    [['P3'], 'low'],
    [['p4'], 'low'],
    [['bug', 'P2', 'priority: urgent'], 'medium'],
    [['urgent', 'high', 'p5', 'priority: someday'], 'none'],
    [['priority: constructor', 'priority: __proto__', 'priority: toString'], 'none'],
    [[], 'none'],
  ] as const)('maps labels %j to %s', (labels, priority) => {
    expect(githubPriorityOf(labels)).toBe(priority);
  });

  it.each([
    [['in progress'], { name: 'in progress', category: 'inProgress' }],
    [['In-Progress'], { name: 'In-Progress', category: 'inProgress' }],
    [['DOING'], { name: 'DOING', category: 'inProgress' }],
    [['status: in progress'], { name: 'status: in progress', category: 'inProgress' }],
    [['progress', 'todo'], { name: 'Open', category: 'todo' }],
  ] as const)('maps open issue labels %j to a status', (labels, status) => {
    expect(githubStatusOf('open', labels)).toEqual(status);
  });

  it('marks closed issues as done', () => {
    expect(githubStatusOf('closed', ['doing'])).toEqual({ name: 'Closed', category: 'done' });
  });
});

describe('GitHub Link header', () => {
  const origin = 'https://api.github.com';
  const current = 'https://api.github.com/issues?filter=assigned&per_page=100&page=1';

  it('returns the path of the next page on the API origin', () => {
    const header =
      '<https://api.github.com/issues?page=1>; rel="prev", <https://api.github.com/issues?page=3&per_page=100>; rel="next"';
    expect(nextPageOf(header, current, origin)).toBe('/issues?page=3&per_page=100');
    expect(nextPageOf('<https://api.github.com/issues?page=9>; rel="last"', current, origin)).toBe(
      null,
    );
    expect(nextPageOf(null, current, origin)).toBeNull();
  });

  it('keeps commas inside the URI and quoted parameters', () => {
    const header =
      '<https://api.github.com/issues?labels=bug,p1&page=2>; title="a, b"; rel="next", <https://api.github.com/issues?page=5>; rel="last"';
    expect(nextPageOf(header, current, origin)).toBe('/issues?labels=bug,p1&page=2');
    expect(nextPageOf('<https://api.github.com/x?a=1>; rel="prev next"', current, origin)).toBe(
      '/x?a=1',
    );
  });

  it('resolves relative targets against the current request', () => {
    expect(nextPageOf('<?page=2>; rel="next"', current, origin)).toBe('/issues?page=2');
    expect(nextPageOf('</issues?page=3>; rel=next', current, origin)).toBe('/issues?page=3');
  });

  it('rejects next links outside the API origin', () => {
    expect(() =>
      nextPageOf('<https://evil.test/issues?page=2>; rel="next"', current, origin),
    ).toThrow('GitHub vrátil neplatný odkaz na ďalšiu stranu.');
    expect(() => nextPageOf('<//evil.test/issues>; rel="next"', current, origin)).toThrow(
      ProviderError,
    );
  });
});

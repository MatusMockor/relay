import { describe, expect, it } from 'vitest';
import { jiraPriorityOf, jiraStatusCategoryOf } from '../src';

describe('Jira priority mapping', () => {
  it.each([
    ['Highest', 'urgent'],
    ['blocker', 'urgent'],
    ['CRITICAL', 'urgent'],
    ['High', 'high'],
    ['Major', 'high'],
    ['Medium', 'medium'],
    ['Low', 'low'],
    ['Lowest', 'low'],
    ['Minor', 'low'],
    ['Trivial', 'low'],
    [' medium ', 'medium'],
    ['P1', 'none'],
    ['constructor', 'none'],
    ['__proto__', 'none'],
    ['', 'none'],
    [null, 'none'],
    [undefined, 'none'],
  ] as const)('maps %s to %s', (name, priority) => {
    expect(jiraPriorityOf(name)).toBe(priority);
  });
});

describe('Jira status category mapping', () => {
  it.each([
    ['new', 'todo'],
    ['indeterminate', 'inProgress'],
    ['done', 'done'],
    ['undefined', 'todo'],
    ['constructor', 'todo'],
    [null, 'todo'],
  ] as const)('maps %s to %s', (key, category) => {
    expect(jiraStatusCategoryOf(key)).toBe(category);
  });
});

import { type TaskPriority, TaskIdSchema, ThreadIdSchema, type ThreadSummary } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { buildListLayout } from '../src/features/list/list-entries';
import { type ListItem, threadItem } from '../src/features/mail/list-items';
import {
  orderTaskItems,
  priorityOfItem,
  threadPriority,
} from '../src/features/tasks/thread-priorities';
import { serverThread } from './support/thread-fixtures';

const NOW = new Date(2026, 10, 19, 12, 0);

const taskThread = (
  id: string,
  priority: TaskPriority | null,
  lastMessageAt = '2026-11-15T08:00:00.000Z',
): ThreadSummary =>
  serverThread(`Predmet ${id}`, {
    id: ThreadIdSchema.parse(id),
    lastMessageAt,
    activeTask: priority === null ? null : { id: TaskIdSchema.parse(`task-${id}`), priority },
  });

const keys = (items: readonly ListItem[]): string[] => items.map((entry) => entry.key);

describe('task priority grouping', () => {
  it('reads the priority of the active task and prefers a pending change', () => {
    const thread = taskThread('a', 'low');

    expect(threadPriority(thread, {})).toBe('low');
    expect(threadPriority(thread, { 'task-a': 'urgent' })).toBe('urgent');
    expect(threadPriority(taskThread('b', null), { 'task-b': 'high' })).toBe('none');
  });

  it('orders by priority, then by the last message and the thread id like the stores', () => {
    const items = [
      taskThread('a', 'low', '2026-11-15T08:00:00.000Z'),
      taskThread('b', 'urgent', '2026-10-01T08:00:00.000Z'),
      taskThread('c', 'none', '2026-11-18T08:00:00.000Z'),
      taskThread('d', 'urgent', '2026-11-16T08:00:00.000Z'),
      taskThread('e', 'low', '2026-11-15T08:00:00.000Z'),
    ].map(threadItem);

    expect(keys(orderTaskItems(items, priorityOfItem({})))).toEqual(['d', 'b', 'e', 'a', 'c']);
    expect(keys(orderTaskItems(items, priorityOfItem({ 'task-c': 'high' })))).toEqual([
      'd',
      'b',
      'c',
      'e',
      'a',
    ]);
  });

  it('lays out the tasks view under priority headers in the displayed order', () => {
    const priorityOf = priorityOfItem({});
    const items = orderTaskItems(
      [
        taskThread('a', 'none'),
        taskThread('b', 'high', '2026-11-16T08:00:00.000Z'),
        taskThread('c', 'urgent'),
        taskThread('d', 'high'),
      ].map(threadItem),
      priorityOf,
    );

    const layout = buildListLayout(items, 'tasks', NOW, priorityOf);

    expect(
      layout.spans.map((span) => [span.group.label, span.group.priority, span.group.items.length]),
    ).toEqual([
      ['Urgentné', 'urgent', 1],
      ['Vysoká', 'high', 2],
      ['Bez priority', 'none', 1],
    ]);
    expect(layout.spans.every((span) => span.header)).toBe(true);
    expect(
      layout.entries.flatMap((entry) =>
        entry.kind === 'row' ? [[entry.key, entry.position]] : [],
      ),
    ).toEqual([
      ['c', 0],
      ['b', 1],
      ['d', 2],
      ['a', 3],
    ]);
  });

  it('keeps day groups outside the tasks view', () => {
    const layout = buildListLayout(
      [threadItem(taskThread('a', 'urgent'))],
      'inbox',
      NOW,
      priorityOfItem({}),
    );

    expect(layout.spans.map((span) => span.group.priority)).toEqual([undefined]);
  });
});

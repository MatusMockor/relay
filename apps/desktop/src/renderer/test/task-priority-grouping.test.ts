import { type Task, type TaskPriority, TaskSchema, ThreadIdSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { buildListLayout } from '../src/features/list/list-entries';
import { threadItem } from '../src/features/mail/list-items';
import {
  orderByPriority,
  priorityOfItem,
  threadTaskIndex,
} from '../src/features/tasks/thread-priorities';
import { serverThread } from './support/thread-fixtures';

const NOW = new Date(2026, 10, 19, 12, 0);

const task = (id: string, threadId: string, overrides: Partial<Task> = {}): Task =>
  TaskSchema.parse({
    id,
    userId: 'user-1',
    threadId,
    jiraKey: null,
    title: `Úloha ${id}`,
    aiWhat: null,
    state: 'open',
    source: 'manual',
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
    ...overrides,
  });

const item = (id: string) =>
  threadItem(serverThread(`Predmet ${id}`, { id: ThreadIdSchema.parse(id) }));

const tasksFor = (priorities: Readonly<Record<string, TaskPriority>>): Task[] =>
  Object.entries(priorities).map(([threadId, priority]) =>
    task(`task-${threadId}`, threadId, { priority }),
  );

describe('task priority grouping', () => {
  it('uses the open task with the highest priority as the task of a thread', () => {
    const index = threadTaskIndex([
      task('done-urgent', 'thr-1', { state: 'done', priority: 'urgent' }),
      task('open-low', 'thr-1', { priority: 'low' }),
      task('open-high', 'thr-1', { priority: 'high', state: 'waiting' }),
      task('loose', 'thr-2', { threadId: null, priority: 'urgent' }),
    ]);

    expect(index.get('thr-1')?.id).toBe('open-high');
    expect(index.has('thr-2')).toBe(false);
  });

  it('orders by priority and keeps the list order within a priority', () => {
    const priorityOf = priorityOfItem(
      threadTaskIndex(tasksFor({ a: 'low', b: 'urgent', c: 'none', d: 'urgent', e: 'medium' })),
    );

    const ordered = orderByPriority(['a', 'b', 'c', 'd', 'e', 'f'].map(item), priorityOf);

    expect(ordered.map((entry) => entry.key)).toEqual(['b', 'd', 'e', 'a', 'c', 'f']);
  });

  it('lays out the tasks view under priority headers in the displayed order', () => {
    const priorityOf = priorityOfItem(
      threadTaskIndex(tasksFor({ a: 'none', b: 'high', c: 'urgent', d: 'high' })),
    );
    const items = orderByPriority(['a', 'b', 'c', 'd'].map(item), priorityOf);

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
    const priorityOf = priorityOfItem(threadTaskIndex(tasksFor({ a: 'urgent' })));

    const layout = buildListLayout([item('a')], 'inbox', NOW, priorityOf);

    expect(layout.spans.map((span) => span.group.priority)).toEqual([undefined]);
  });
});

import type { ThreadFolderQuery } from '@relay/engine';
import type { Task, TaskPriority, TaskState, ThreadSummary, UserId } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { at, newId, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const PLAIN_THREADS = 55;

const query = (overrides: Partial<ThreadFolderQuery> = {}): ThreadFolderQuery => ({
  view: 'tasks',
  accountId: null,
  splitId: null,
  labelId: null,
  mailboxId: null,
  search: null,
  cursor: null,
  limit: 20,
  ...overrides,
});

const plainSubject = (index: number): string => `plain-${String(index).padStart(2, '0')}`;

describe('PgThreadRepository tasks view by priority', () => {
  const context = usePgTestContext();
  let work: SeededAccount;
  const taskIds = new Map<string, string>();

  const addTask = async (
    userId: UserId,
    thread: ThreadSummary,
    name: string,
    priority: TaskPriority,
    state: TaskState = 'open',
  ): Promise<void> => {
    const task: Task = {
      id: newId('task'),
      userId,
      threadId: thread.id,
      jiraKey: null,
      title: name,
      aiWhat: null,
      state,
      source: 'manual',
      priority,
      createdAt: at(0),
      updatedAt: at(0),
    };
    taskIds.set(name, task.id);
    await context.repositories.tasks.upsert(task);
  };

  const thread = async (subject: string, minutes: number): Promise<ThreadSummary> =>
    (await seedThread(context.repositories, work, { subject, lastMessageAt: at(minutes) })).thread;

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    const userId = work.user.id;
    for (let index = 0; index < PLAIN_THREADS; index += 1) {
      const plain = await thread(plainSubject(index), 1_000 + index);
      await addTask(userId, plain, `open-${String(index)}`, 'none');
      if (index % 2 === 0) {
        await addTask(userId, plain, `done-${String(index)}`, 'urgent', 'done');
      }
    }
    await addTask(userId, await thread('old', -50_000), 'urgent-old', 'urgent');
    await addTask(userId, await thread('high', 10), 'high', 'high', 'waiting');
    const mixed = await thread('mixed', 20);
    await addTask(userId, mixed, 'mixed-low', 'low');
    await addTask(userId, mixed, 'mixed-medium', 'medium');
    await addTask(userId, mixed, 'mixed-done', 'urgent', 'done');
    await addTask(userId, await thread('only-done', 5_000), 'only-done', 'urgent', 'done');
  });

  it('orders by the best active task, then by the last message, across pages', async () => {
    const pages: ThreadSummary[][] = [];
    let cursor: string | null = null;
    do {
      const page = await context.repositories.threads.queryFolder(work.user.id, query({ cursor }));
      pages.push(page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    const items = pages.flat();
    const plain = Array.from({ length: PLAIN_THREADS }, (_, index) =>
      plainSubject(PLAIN_THREADS - 1 - index),
    );

    expect(pages).toHaveLength(3);
    expect(items.map((item) => item.subject)).toEqual(['old', 'high', 'mixed', ...plain]);
    expect(items.slice(0, 3).map((item) => item.activeTask)).toEqual([
      { id: taskIds.get('urgent-old'), priority: 'urgent' },
      { id: taskIds.get('high'), priority: 'high' },
      { id: taskIds.get('mixed-medium'), priority: 'medium' },
    ]);
    expect(items.at(-1)?.activeTask).toEqual({ id: taskIds.get('open-0'), priority: 'none' });
  });

  it('keeps the other views without an active task projection', async () => {
    const page = await context.repositories.threads.queryFolder(
      work.user.id,
      query({ view: 'inbox', limit: 5 }),
    );

    expect(page.items[0]?.subject).toBe('only-done');
    expect(page.items.every((item) => item.activeTask === undefined)).toBe(true);
  });
});

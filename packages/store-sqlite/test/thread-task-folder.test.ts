import { type Task, TaskIdSchema, type TaskPriority, type TaskState } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { threadId } from './support/fixtures';
import { addThread, folderQuery } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const PLAIN_THREADS = 55;

const minutesAfter = (minutes: number): string =>
  new Date(Date.UTC(2026, 10, 10, 8, 0) + minutes * 60_000).toISOString();

const plainId = (index: number): string => `t-${String(index).padStart(2, '0')}`;

const buildTask = (
  id: string,
  thread: string,
  priority: TaskPriority,
  state: TaskState = 'open',
): Task => ({
  id: TaskIdSchema.parse(id),
  userId: LOCAL_USER_ID,
  threadId: threadId(thread),
  jiraKey: null,
  title: `Úloha ${id}`,
  aiWhat: null,
  state,
  source: 'manual',
  priority,
  createdAt: minutesAfter(0),
  updatedAt: minutesAfter(0),
});

describe('SqliteThreadRepository tasks view by priority', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    const { tasks } = store.repositories;
    for (let index = 0; index < PLAIN_THREADS; index += 1) {
      const id = plainId(index);
      await addThread(store, work, id, { lastMessageAt: minutesAfter(100 + index) });
      await tasks.upsert(buildTask(`open-${id}`, id, 'none'));
      if (index % 2 === 0) {
        await tasks.upsert(buildTask(`done-${id}`, id, 'urgent', 'done'));
      }
    }
    await addThread(store, work, 't-old', { lastMessageAt: '2026-10-01T08:00:00.000Z' });
    await tasks.upsert(buildTask('urgent-old', 't-old', 'urgent'));
    await addThread(store, work, 't-high', { lastMessageAt: minutesAfter(10) });
    await tasks.upsert(buildTask('high', 't-high', 'high', 'waiting'));
    await addThread(store, work, 't-mixed', { lastMessageAt: minutesAfter(20) });
    await tasks.upsert(buildTask('mixed-low', 't-mixed', 'low'));
    await tasks.upsert(buildTask('mixed-medium', 't-mixed', 'medium'));
    await tasks.upsert(buildTask('mixed-done', 't-mixed', 'urgent', 'done'));
    await addThread(store, work, 't-only-done', { lastMessageAt: minutesAfter(500) });
    await tasks.upsert(buildTask('only-done', 't-only-done', 'urgent', 'done'));
  });

  afterEach(() => {
    store.database.close();
  });

  it('orders by the best active task, then by the last message, across pages', async () => {
    const pages = [];
    let cursor: string | null = null;
    do {
      const page = await store.repositories.threads.queryFolder(
        LOCAL_USER_ID,
        folderQuery({ view: 'tasks', limit: 20, cursor }),
      );
      pages.push(page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    const items = pages.flat();
    const plain = Array.from({ length: PLAIN_THREADS }, (_, index) =>
      plainId(PLAIN_THREADS - 1 - index),
    );

    expect(pages).toHaveLength(3);
    expect(items.map((thread) => thread.id)).toEqual(['t-old', 't-high', 't-mixed', ...plain]);
    expect(items.slice(0, 3).map((thread) => thread.activeTask)).toEqual([
      { id: 'urgent-old', priority: 'urgent' },
      { id: 'high', priority: 'high' },
      { id: 'mixed-medium', priority: 'medium' },
    ]);
    expect(items.at(-1)?.activeTask).toEqual({ id: 'open-t-00', priority: 'none' });
  });

  it('keeps the other views without an active task projection', async () => {
    const page = await store.repositories.threads.queryFolder(
      LOCAL_USER_ID,
      folderQuery({ view: 'inbox', limit: 5 }),
    );

    expect(page.items.map((thread) => thread.id)[0]).toBe('t-only-done');
    expect(page.items.every((thread) => thread.activeTask === undefined)).toBe(true);
  });
});

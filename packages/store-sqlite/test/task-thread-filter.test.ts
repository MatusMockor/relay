import { type Task, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildThread, threadId, userId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const buildTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: TaskIdSchema.parse(id),
  userId: LOCAL_USER_ID,
  threadId: threadId('thr-1'),
  jiraKey: null,
  title: 'Skontrolovať faktúru',
  aiWhat: null,
  state: 'open',
  source: 'manual',
  priority: 'none',
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('SqliteTaskRepository thread filter', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedAccount(store.repositories);
    await store.repositories.threads.upsert(buildThread());
    await store.repositories.threads.upsert(buildThread({ id: threadId('thr-2') }));
  });

  afterEach(() => {
    store.database.close();
  });

  it('lists only the tasks of the given thread and combines it with the state filter', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask('t1', { updatedAt: '2026-11-10T10:00:00.000Z' }));
    await tasks.upsert(buildTask('t2', { updatedAt: '2026-11-11T10:00:00.000Z', state: 'done' }));
    await tasks.upsert(buildTask('t3', { threadId: threadId('thr-2') }));
    await tasks.upsert(buildTask('t4', { threadId: null }));
    await tasks.upsert(buildTask('t5', { userId: userId('intruder'), threadId: null }));

    const all = await tasks.list(LOCAL_USER_ID, {
      state: null,
      threadId: threadId('thr-1'),
      cursor: null,
      limit: 10,
    });
    const done = await tasks.list(LOCAL_USER_ID, {
      state: 'done',
      threadId: threadId('thr-1'),
      cursor: null,
      limit: 10,
    });
    const other = await tasks.list(LOCAL_USER_ID, {
      state: null,
      threadId: threadId('thr-2'),
      cursor: null,
      limit: 10,
    });
    const unfiltered = await tasks.list(LOCAL_USER_ID, { state: null, cursor: null, limit: 10 });

    expect(all.items.map((task) => task.id)).toEqual(['t2', 't1']);
    expect(done.items.map((task) => task.id)).toEqual(['t2']);
    expect(other.items.map((task) => task.id)).toEqual(['t3']);
    expect(unfiltered.items.map((task) => task.id).sort()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('pages within a thread', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask('t1', { updatedAt: '2026-11-10T10:00:00.000Z' }));
    await tasks.upsert(buildTask('t2', { updatedAt: '2026-11-11T10:00:00.000Z' }));
    await tasks.upsert(
      buildTask('t3', { threadId: threadId('thr-2'), updatedAt: '2026-11-12T10:00:00.000Z' }),
    );
    const query = { state: null, threadId: threadId('thr-1'), limit: 1 };

    const first = await tasks.list(LOCAL_USER_ID, { ...query, cursor: null });
    const second = await tasks.list(LOCAL_USER_ID, { ...query, cursor: first.nextCursor });

    expect(first.items.map((task) => task.id)).toEqual(['t2']);
    expect(second.items.map((task) => task.id)).toEqual(['t1']);
    expect(second.nextCursor).toBeNull();
  });
});

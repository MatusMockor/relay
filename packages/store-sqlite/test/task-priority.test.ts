import { type Task, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, createTestStore, type TestStore } from './support/test-database';

const buildTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: TaskIdSchema.parse(id),
  userId: LOCAL_USER_ID,
  threadId: null,
  jiraKey: null,
  title: `Úloha ${id}`,
  aiWhat: null,
  state: 'open',
  source: 'manual',
  priority: 'none',
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const at = (day: number): string => `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;

describe('SqliteTaskRepository priority', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('persists the priority and changes it with an update', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask('t1', { priority: 'high' }));

    const updated = await tasks.update(LOCAL_USER_ID, TaskIdSchema.parse('t1'), {
      priority: 'urgent',
      updatedAt: at(12),
    });

    expect(updated).toMatchObject({ id: 't1', priority: 'urgent', updatedAt: at(12) });
    expect(await tasks.findById(LOCAL_USER_ID, TaskIdSchema.parse('t1'))).toMatchObject({
      priority: 'urgent',
    });
  });

  it('lists tasks by priority first and by the latest change within a priority', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask('none-new', { updatedAt: at(20) }));
    await tasks.upsert(buildTask('low', { priority: 'low', updatedAt: at(19) }));
    await tasks.upsert(buildTask('high-old', { priority: 'high', updatedAt: at(10) }));
    await tasks.upsert(buildTask('urgent', { priority: 'urgent', updatedAt: at(5) }));
    await tasks.upsert(buildTask('high-new', { priority: 'high', updatedAt: at(15) }));
    await tasks.upsert(buildTask('medium', { priority: 'medium', updatedAt: at(1) }));

    const page = await tasks.list(LOCAL_USER_ID, { state: null, cursor: null, limit: 10 });

    expect(page.items.map((task) => task.id)).toEqual([
      'urgent',
      'high-new',
      'high-old',
      'medium',
      'low',
      'none-new',
    ]);
  });

  it('pages across priority groups without skipping or repeating tasks', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask('a', { priority: 'urgent', updatedAt: at(1) }));
    await tasks.upsert(buildTask('b', { priority: 'high', updatedAt: at(9) }));
    await tasks.upsert(buildTask('c', { priority: 'high', updatedAt: at(9) }));
    await tasks.upsert(buildTask('d', { updatedAt: at(20) }));
    await tasks.upsert(buildTask('e', { priority: 'low', updatedAt: at(3) }));
    const query = { state: null, limit: 2 };

    const first = await tasks.list(LOCAL_USER_ID, { ...query, cursor: null });
    const second = await tasks.list(LOCAL_USER_ID, { ...query, cursor: first.nextCursor });
    const third = await tasks.list(LOCAL_USER_ID, { ...query, cursor: second.nextCursor });

    expect([first, second, third].map((page) => page.items.map((task) => task.id))).toEqual([
      ['a', 'c'],
      ['b', 'e'],
      ['d'],
    ]);
    expect(third.nextCursor).toBeNull();
  });
});

describe('task priority migration', () => {
  it('gives tasks stored before the migration no priority', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0035_task_priority', directory.path),
    });
    database.sqlite
      .prepare(
        `insert into tasks (id, user_id, title, state, source, created_at, updated_at, updated_ts)
         values ('old', ?, 'Stará úloha', 'open', 'jira', ?, ?, 0)`,
      )
      .run(LOCAL_USER_ID, at(1), at(1));

    migrate(database);
    const task = await createSqliteRepositories(database).tasks.findById(
      LOCAL_USER_ID,
      TaskIdSchema.parse('old'),
    );

    expect(task).toMatchObject({ id: 'old', priority: 'none' });
    database.close();
    directory.remove();
  });
});

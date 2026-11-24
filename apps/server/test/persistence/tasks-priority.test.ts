import type { Task, UserId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const buildTask = (userId: UserId, overrides: Partial<Task> = {}): Task => ({
  id: newId('task'),
  userId,
  threadId: null,
  jiraKey: null,
  title: 'Úloha',
  aiWhat: null,
  state: 'open',
  source: 'manual',
  priority: 'none',
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
});

describe('PgTaskRepository priority', () => {
  const context = usePgTestContext();

  it('persists the priority, changes it with an update and reads rows without one as none', async () => {
    const { user } = await seedAccount(context.repositories);
    const { tasks } = context.repositories;
    const stored = await tasks.upsert(buildTask(user.id, { priority: 'high' }));
    const legacy = newId('task');
    await context.db.execute(
      sql`insert into tasks (id, user_id, title, state, source, created_at, updated_at)
          values (${legacy}, ${user.id}, 'Stará', 'open', 'jira', now(), now())`,
    );

    const updated = await tasks.update(user.id, stored.id, {
      priority: 'urgent',
      updatedAt: at(5),
    });

    expect(stored.priority).toBe('high');
    expect(updated).toMatchObject({ id: stored.id, priority: 'urgent' });
    expect(await tasks.findById(user.id, legacy)).toMatchObject({ priority: 'none' });
  });

  it('lists by priority, then by the latest change, and pages across the groups', async () => {
    const { user } = await seedAccount(context.repositories);
    const { tasks } = context.repositories;
    await tasks.upsert(buildTask(user.id, { title: 'none', updatedAt: at(9) }));
    await tasks.upsert(buildTask(user.id, { title: 'low', priority: 'low', updatedAt: at(8) }));
    await tasks.upsert(
      buildTask(user.id, { title: 'high-old', priority: 'high', updatedAt: at(1) }),
    );
    await tasks.upsert(
      buildTask(user.id, { title: 'urgent', priority: 'urgent', updatedAt: at(2) }),
    );
    await tasks.upsert(
      buildTask(user.id, { title: 'high-new', priority: 'high', updatedAt: at(7) }),
    );
    const query = { state: null, limit: 2 };

    const all = await tasks.list(user.id, { ...query, limit: 10, cursor: null });
    const first = await tasks.list(user.id, { ...query, cursor: null });
    const second = await tasks.list(user.id, { ...query, cursor: first.nextCursor });
    const third = await tasks.list(user.id, { ...query, cursor: second.nextCursor });

    expect(all.items.map((task) => task.title)).toEqual([
      'urgent',
      'high-new',
      'high-old',
      'low',
      'none',
    ]);
    expect([first, second, third].map((page) => page.items.map((task) => task.title))).toEqual([
      ['urgent', 'high-new'],
      ['high-old', 'low'],
      ['none'],
    ]);
    expect(third.nextCursor).toBeNull();
  });
});

import type { Task, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount, seedThread } from './support/fixtures';
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

describe('PgTaskRepository thread filter', () => {
  const context = usePgTestContext();

  it('lists only the tasks of the given thread and combines it with state and paging', async () => {
    const seeded = await seedAccount(context.repositories);
    const intruder = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const { thread: other } = await seedThread(context.repositories, seeded);
    const { tasks } = context.repositories;
    await tasks.upsert(
      buildTask(seeded.user.id, { title: 'T1', threadId: thread.id, updatedAt: at(1) }),
    );
    await tasks.upsert(
      buildTask(seeded.user.id, {
        title: 'T2',
        threadId: thread.id,
        state: 'done',
        updatedAt: at(2),
      }),
    );
    await tasks.upsert(
      buildTask(seeded.user.id, { title: 'T3', threadId: other.id, updatedAt: at(3) }),
    );
    await tasks.upsert(buildTask(seeded.user.id, { title: 'T4', updatedAt: at(4) }));
    await tasks.upsert(buildTask(intruder.user.id, { title: 'T5', updatedAt: at(5) }));

    const all = await tasks.list(seeded.user.id, {
      state: null,
      threadId: thread.id,
      cursor: null,
      limit: 10,
    });
    const open = await tasks.list(seeded.user.id, {
      state: 'open',
      threadId: thread.id,
      cursor: null,
      limit: 10,
    });
    const first = await tasks.list(seeded.user.id, {
      state: null,
      threadId: thread.id,
      cursor: null,
      limit: 1,
    });
    const second = await tasks.list(seeded.user.id, {
      state: null,
      threadId: thread.id,
      cursor: first.nextCursor,
      limit: 1,
    });
    const foreign = await tasks.list(intruder.user.id, {
      state: null,
      threadId: thread.id,
      cursor: null,
      limit: 10,
    });

    expect(all.items.map((task) => task.title)).toEqual(['T2', 'T1']);
    expect(open.items.map((task) => task.title)).toEqual(['T1']);
    expect(first.items.map((task) => task.title)).toEqual(['T2']);
    expect(second.items.map((task) => task.title)).toEqual(['T1']);
    expect(second.nextCursor).toBeNull();
    expect(foreign.items).toEqual([]);
  });
});

import { ConflictError } from '@relay/engine';
import type { Reminder, Task, UserId } from '@relay/shared/domain';
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
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
});

describe('PgTaskRepository', () => {
  const context = usePgTestContext();

  it('upserts and finds tasks by id, jira key and thread', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const task = await context.repositories.tasks.upsert(
      buildTask(seeded.user.id, { threadId: thread.id, jiraKey: 'REL-7', source: 'jira' }),
    );
    const updated = await context.repositories.tasks.upsert({
      ...task,
      state: 'waiting',
      updatedAt: at(5),
    });

    expect(updated).toEqual({ ...task, state: 'waiting', updatedAt: at(5) });
    await expect(context.repositories.tasks.findById(seeded.user.id, task.id)).resolves.toEqual(
      updated,
    );
    await expect(
      context.repositories.tasks.findByJiraKey(seeded.user.id, 'REL-7'),
    ).resolves.toEqual(updated);
    await expect(
      context.repositories.tasks.findByThread(seeded.user.id, thread.id),
    ).resolves.toEqual([updated]);
    await expect(
      context.repositories.tasks.upsert(buildTask(seeded.user.id, { jiraKey: 'REL-7' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('pages tasks by last update and filters by state', async () => {
    const seeded = await seedAccount(context.repositories);
    for (const minute of [1, 2, 3, 4]) {
      await context.repositories.tasks.upsert(
        buildTask(seeded.user.id, {
          title: `T${String(minute)}`,
          state: minute % 2 === 0 ? 'done' : 'open',
          updatedAt: at(minute),
        }),
      );
    }
    const first = await context.repositories.tasks.list(seeded.user.id, {
      state: null,
      cursor: null,
      limit: 3,
    });
    const second = await context.repositories.tasks.list(seeded.user.id, {
      state: null,
      cursor: first.nextCursor,
      limit: 3,
    });
    const open = await context.repositories.tasks.list(seeded.user.id, {
      state: 'open',
      cursor: null,
      limit: 10,
    });

    expect(first.items.map((task) => task.title)).toEqual(['T4', 'T3', 'T2']);
    expect(second.items.map((task) => task.title)).toEqual(['T1']);
    expect(second.nextCursor).toBeNull();
    expect(open.items.map((task) => task.title)).toEqual(['T3', 'T1']);
  });

  it('keeps tasks private and detaches them from deleted threads', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const task = await context.repositories.tasks.upsert(
      buildTask(seeded.user.id, { threadId: thread.id }),
    );

    await expect(
      context.repositories.tasks.findById(stranger.user.id, task.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.tasks.upsert({
        ...task,
        userId: stranger.user.id,
        threadId: null,
        title: 'Ukradnuté',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(context.repositories.tasks.delete(stranger.user.id, task.id)).resolves.toBe(false);

    await context.repositories.threads.delete(thread.id);
    await expect(context.repositories.tasks.findById(seeded.user.id, task.id)).resolves.toEqual({
      ...task,
      threadId: null,
    });
    await expect(context.repositories.tasks.delete(seeded.user.id, task.id)).resolves.toBe(true);
  });
});

describe('PgReminderRepository', () => {
  const context = usePgTestContext();

  const buildReminder = (
    userId: UserId,
    threadId: Reminder['threadId'],
    remindAt: string,
  ): Reminder => ({
    id: newId('reminder'),
    userId,
    threadId,
    remindAt,
    firedAt: null,
    createdAt: at(0),
  });

  it('keeps one active reminder per thread and lists due ones', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const other = await seedThread(context.repositories, seeded);
    const reminder = await context.repositories.reminders.upsert(
      buildReminder(seeded.user.id, thread.id, at(60)),
    );
    await context.repositories.reminders.upsert(
      buildReminder(seeded.user.id, other.thread.id, at(120)),
    );

    await expect(
      context.repositories.reminders.upsert(buildReminder(seeded.user.id, thread.id, at(90))),
    ).rejects.toBeInstanceOf(ConflictError);
    const moved = await context.repositories.reminders.upsert({ ...reminder, remindAt: at(30) });
    expect(moved).toEqual({ ...reminder, remindAt: at(30) });

    await expect(
      context.repositories.reminders.findActiveByThread(seeded.user.id, thread.id),
    ).resolves.toEqual(moved);
    const due = await context.repositories.reminders.listDue(at(100), 10);
    expect(due.map((item) => item.id)).toEqual([reminder.id]);
  });

  it('marks reminders fired and deletes for the owner only', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const reminder = await context.repositories.reminders.upsert(
      buildReminder(seeded.user.id, thread.id, at(1)),
    );

    await context.repositories.reminders.markFired(reminder.id, at(2));
    await expect(
      context.repositories.reminders.findActiveByThread(seeded.user.id, thread.id),
    ).resolves.toBeNull();
    await expect(context.repositories.reminders.listDue(at(10), 10)).resolves.toEqual([]);
    const next = await context.repositories.reminders.upsert(
      buildReminder(seeded.user.id, thread.id, at(50)),
    );
    expect(next.firedAt).toBeNull();

    await expect(context.repositories.reminders.delete(stranger.user.id, next.id)).resolves.toBe(
      false,
    );
    await expect(context.repositories.reminders.delete(seeded.user.id, next.id)).resolves.toBe(
      true,
    );
  });

  it('creates a Jira task once when two creations race', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const jiraTask = (overrides: Partial<Task>) => ({
      ...buildTask(seeded.user.id, { threadId: thread.id, source: 'jira', ...overrides }),
      jiraKey: 'REL-21',
    });

    const results = await Promise.all([
      context.repositories.tasks.createOrGetByJiraKey(jiraTask({})),
      context.repositories.tasks.createOrGetByJiraKey(jiraTask({ state: 'done' })),
      context.repositories.tasks.createOrGetByJiraKey(jiraTask({ state: 'waiting' })),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.task.id)).size).toBe(1);
    const page = await context.repositories.tasks.list(seeded.user.id, {
      state: null,
      cursor: null,
      limit: 50,
    });
    expect(page.items.filter((task) => task.jiraKey === 'REL-21')).toHaveLength(1);
    expect(results[0].task).toMatchObject({ jiraKey: 'REL-21' });
  });
});

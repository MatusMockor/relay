import { ConflictError, ValidationError } from '@relay/engine';
import { type Reminder, ReminderIdSchema, type Task, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildThread, threadId, userId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const taskId = (value: string) => TaskIdSchema.parse(value);
const reminderId = (value: string) => ReminderIdSchema.parse(value);

const buildTask = (overrides: Partial<Task> = {}): Task => ({
  id: taskId('tsk-1'),
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

const buildReminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: reminderId('rem-1'),
  userId: LOCAL_USER_ID,
  threadId: threadId('thr-1'),
  remindAt: '2026-11-12T08:00:00.000Z',
  firedAt: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('SqliteTaskRepository and SqliteReminderRepository', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedAccount(store.repositories);
    await store.repositories.threads.upsert(buildThread());
  });

  afterEach(() => {
    store.database.close();
  });

  it('pages tasks by update time with an optional state filter', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask({ id: taskId('t1'), updatedAt: '2026-11-10T10:00:00.000Z' }));
    await tasks.upsert(buildTask({ id: taskId('t2'), updatedAt: '2026-11-11T10:00:00.000Z' }));
    await tasks.upsert(
      buildTask({ id: taskId('t3'), updatedAt: '2026-11-11T10:00:00.000Z', state: 'done' }),
    );
    await tasks.upsert(buildTask({ id: taskId('t4'), userId: userId('intruder'), threadId: null }));

    const first = await tasks.list(LOCAL_USER_ID, { state: null, cursor: null, limit: 2 });
    const second = await tasks.list(LOCAL_USER_ID, {
      state: null,
      cursor: first.nextCursor,
      limit: 2,
    });
    const open = await tasks.list(LOCAL_USER_ID, { state: 'open', cursor: null, limit: 10 });

    expect(first.items.map((task) => task.id)).toEqual(['t3', 't2']);
    expect(second).toMatchObject({ nextCursor: null });
    expect(second.items.map((task) => task.id)).toEqual(['t1']);
    expect(open.items.map((task) => task.id)).toEqual(['t2', 't1']);
  });

  it('finds tasks by id, Jira key and thread and enforces one task per Jira key', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask({ jiraKey: 'REL-7', source: 'jira' }));
    await tasks.upsert(buildTask({ jiraKey: 'REL-7', source: 'jira', title: 'Updated' }));

    expect((await tasks.findById(LOCAL_USER_ID, taskId('tsk-1')))?.title).toBe('Updated');
    expect((await tasks.findByJiraKey(LOCAL_USER_ID, 'REL-7'))?.id).toBe('tsk-1');
    expect(await tasks.findByJiraKey(userId('intruder'), 'REL-7')).toBeNull();
    expect(await tasks.findByThread(LOCAL_USER_ID, threadId('thr-1'))).toHaveLength(1);
    await expect(
      tasks.upsert(buildTask({ id: taskId('tsk-2'), jiraKey: 'REL-7' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a Jira task once and returns the existing one afterwards', async () => {
    const { tasks } = store.repositories;
    const jiraTask = (overrides: Partial<Task>) => ({
      ...buildTask({ source: 'jira', ...overrides }),
      jiraKey: 'REL-8',
    });

    const [first, second] = await Promise.all([
      tasks.createOrGetByJiraKey(jiraTask({ id: taskId('tsk-1') })),
      tasks.createOrGetByJiraKey(jiraTask({ id: taskId('tsk-2'), state: 'done' })),
    ]);

    expect(first).toMatchObject({ created: true, task: { id: 'tsk-1', state: 'open' } });
    expect(second).toMatchObject({ created: false, task: { id: 'tsk-1', state: 'open' } });
    expect(await tasks.findById(LOCAL_USER_ID, taskId('tsk-2'))).toBeNull();
  });

  it('updates only the given task fields of the owner', async () => {
    const { tasks } = store.repositories;
    await tasks.upsert(buildTask());
    await tasks.update(LOCAL_USER_ID, taskId('tsk-1'), {
      title: 'Nový názov',
      updatedAt: '2026-11-10T11:00:00.000Z',
    });

    const updated = await tasks.update(LOCAL_USER_ID, taskId('tsk-1'), {
      state: 'waiting',
      updatedAt: '2026-11-10T12:00:00.000Z',
    });

    expect(updated).toMatchObject({
      title: 'Nový názov',
      state: 'waiting',
      updatedAt: '2026-11-10T12:00:00.000Z',
    });
    expect(
      await tasks.update(userId('intruder'), taskId('tsk-1'), {
        state: 'done',
        updatedAt: '2026-11-10T13:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('deletes tasks and detaches them when their thread disappears', async () => {
    const { tasks, threads } = store.repositories;
    await tasks.upsert(buildTask());
    await tasks.upsert(buildTask({ id: taskId('tsk-2') }));

    expect(await tasks.delete(LOCAL_USER_ID, taskId('tsk-1'))).toBe(true);
    expect(await tasks.delete(LOCAL_USER_ID, taskId('tsk-1'))).toBe(false);
    await threads.delete(threadId('thr-1'));
    expect((await tasks.findById(LOCAL_USER_ID, taskId('tsk-2')))?.threadId).toBeNull();
  });

  it('lists due reminders in order and marks them fired', async () => {
    const { reminders } = store.repositories;
    await reminders.upsert(
      buildReminder({ id: reminderId('r-late'), remindAt: '2026-11-12T10:00:00+02:00' }),
    );
    await reminders.upsert(
      buildReminder({ id: reminderId('r-early'), remindAt: '2026-11-12T07:00:00.000Z' }),
    );
    await reminders.upsert(
      buildReminder({ id: reminderId('r-future'), remindAt: '2026-12-01T07:00:00.000Z' }),
    );

    const due = await reminders.listDue('2026-11-12T08:00:00.000Z', 10);
    expect(due.map((reminder) => reminder.id)).toEqual(['r-early', 'r-late']);
    expect(await reminders.listDue('2026-11-12T08:00:00.000Z', 1)).toHaveLength(1);

    await reminders.markFired(reminderId('r-early'), '2026-11-12T08:00:01.000Z');
    expect(
      (await reminders.listDue('2026-11-12T08:00:00.000Z', 10)).map((reminder) => reminder.id),
    ).toEqual(['r-late']);
  });

  it('finds the active reminder of a thread and deletes reminders', async () => {
    const { reminders } = store.repositories;
    await reminders.upsert(
      buildReminder({ id: reminderId('r-old'), firedAt: '2026-11-11T08:00:00.000Z' }),
    );
    await reminders.upsert(buildReminder({ id: reminderId('r-new') }));

    expect((await reminders.findActiveByThread(LOCAL_USER_ID, threadId('thr-1')))?.id).toBe(
      'r-new',
    );
    expect(await reminders.delete(userId('intruder'), reminderId('r-new'))).toBe(false);
    expect(await reminders.delete(LOCAL_USER_ID, reminderId('r-new'))).toBe(true);
    expect(await reminders.findActiveByThread(LOCAL_USER_ID, threadId('thr-1'))).toBeNull();
  });

  it('rejects reminders for unknown threads and invalid times', async () => {
    const { reminders } = store.repositories;
    await expect(
      reminders.upsert(buildReminder({ threadId: threadId('missing') })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(reminders.listDue('not a date', 10)).rejects.toBeInstanceOf(ValidationError);
  });
});

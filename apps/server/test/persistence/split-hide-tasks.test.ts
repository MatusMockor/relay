import type { ThreadFolderQuery } from '@relay/engine';
import type { Split, Task, TaskId, ThreadSummary } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { at, newId, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const query = (overrides: Partial<ThreadFolderQuery>): ThreadFolderQuery => ({
  view: 'inbox',
  accountId: null,
  splitId: null,
  labelId: null,
  mailboxId: null,
  search: null,
  cursor: null,
  limit: 50,
  ...overrides,
});

describe('PgThreadRepository split that hides threads in tasks', () => {
  const context = usePgTestContext();
  let work: SeededAccount;
  let split: Split;
  let tasked: ThreadSummary;
  const taskId: TaskId = newId('task');

  const splitSubjects = async () =>
    (
      await context.repositories.threads.queryFolder(work.user.id, query({ splitId: split.id }))
    ).items.map((thread) => thread.subject);

  const saveSplit = (hideTasks: boolean) =>
    context.repositories.splits.replaceAll(work.user.id, [{ ...split, hideTasks }]);

  const saveTask = (state: Task['state']) =>
    context.repositories.tasks.upsert({
      id: taskId,
      userId: work.user.id,
      threadId: tasked.id,
      jiraKey: 'REL-1',
      title: 'Opraviť platby',
      aiWhat: null,
      state,
      source: 'jira',
      createdAt: at(1),
      updatedAt: at(1),
    });

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    split = {
      id: newId('split'),
      userId: work.user.id,
      accountId: null,
      name: 'Moje Jira tasky',
      order: 0,
      match: 'any',
      exceptions: [],
      rules: [{ type: 'jira', projectKeys: [] }],
      exclusive: true,
      hideTasks: false,
    };
    await context.repositories.splits.replaceAll(work.user.id, [split]);
    const seeded = await seedThread(context.repositories, work, {
      subject: 'task',
      lastMessageAt: at(1),
      splitIds: [split.id],
    });
    tasked = seeded.thread;
    await seedThread(context.repositories, work, {
      subject: 'update',
      lastMessageAt: at(2),
      splitIds: [split.id],
    });
    await saveTask('open');
  });

  it('keeps a thread with an open task in the split while the flag is off', async () => {
    await saveSplit(false);

    await expect(splitSubjects()).resolves.toEqual(['update', 'task']);
  });

  it('hides a thread with an open task from the split when the flag is on', async () => {
    await saveSplit(true);

    await expect(splitSubjects()).resolves.toEqual(['update']);
    const tasks = await context.repositories.threads.queryFolder(
      work.user.id,
      query({ view: 'tasks' }),
    );
    expect(tasks.items.map((thread) => thread.subject)).toEqual(['task']);
    await expect(context.repositories.splits.listByUser(work.user.id)).resolves.toEqual([
      { ...split, hideTasks: true },
    ]);
  });

  it('finds a hidden task thread when searching the main inbox but not its split', async () => {
    await saveSplit(true);
    const subjects = async (overrides: Partial<ThreadFolderQuery>) =>
      (await context.repositories.threads.queryFolder(work.user.id, query(overrides))).items.map(
        (thread) => thread.subject,
      );

    await expect(subjects({})).resolves.toEqual([]);
    await expect(subjects({ search: 'task' })).resolves.toEqual(['task']);
    await expect(subjects({ splitId: split.id, search: 'task' })).resolves.toEqual([]);
  });

  it('shows the thread in the split again once its task is done', async () => {
    await saveSplit(true);
    await saveTask('done');

    await expect(splitSubjects()).resolves.toEqual(['update', 'task']);
  });
});

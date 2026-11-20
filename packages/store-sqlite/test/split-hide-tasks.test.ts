import { type Split, SplitIdSchema, type Task, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { threadId } from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TestStore } from './support/test-database';

const JIRA_SPLIT = SplitIdSchema.parse('spl-jira');

const jiraSplit = (hideTasks: boolean): Split => ({
  id: JIRA_SPLIT,
  userId: LOCAL_USER_ID,
  accountId: null,
  name: 'Moje Jira tasky',
  order: 0,
  exclusive: true,
  hideTasks,
  match: 'any',
  exceptions: [],
  rules: [{ type: 'jira', projectKeys: [] }],
});

const jiraTask = (state: Task['state']): Task => ({
  id: TaskIdSchema.parse('tsk-jira'),
  userId: LOCAL_USER_ID,
  threadId: threadId('t-task'),
  jiraKey: 'REL-1',
  title: 'Opraviť platby',
  aiWhat: null,
  state,
  source: 'jira',
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
});

describe('split that hides threads in tasks', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    await addThread(store, work, 't-task', { splitIds: [JIRA_SPLIT] }, { subject: 'REL-1 Platby' });
    await addThread(
      store,
      work,
      't-update',
      { splitIds: [JIRA_SPLIT] },
      { subject: 'REL-2 Build' },
    );
    await store.repositories.tasks.upsert(jiraTask('open'));
  });

  afterEach(() => {
    store.database.close();
  });

  it('hides a thread with an open task from the split list', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [jiraSplit(true)]);

    expect(await folderIds(store, { splitId: JIRA_SPLIT })).toEqual(['t-update']);
    expect(await folderIds(store, { view: 'tasks' })).toEqual(['t-task']);
  });

  it('keeps the thread in the split list when the flag is off', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [jiraSplit(false)]);

    expect(await folderIds(store, { splitId: JIRA_SPLIT })).toEqual(['t-update', 't-task']);
  });

  it('finds a hidden task thread when searching the main inbox but not its split', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [jiraSplit(true)]);

    expect(await folderIds(store, {})).toEqual([]);
    expect(await folderIds(store, { search: 'platby' })).toEqual(['t-task']);
    expect(await folderIds(store, { splitId: JIRA_SPLIT, search: 'platby' })).toEqual([]);
  });

  it('shows the thread in the split list again once its task is done', async () => {
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [jiraSplit(true)]);
    await store.repositories.tasks.upsert(jiraTask('done'));

    expect(await folderIds(store, { splitId: JIRA_SPLIT })).toEqual(['t-update', 't-task']);
    expect(await store.repositories.splits.listByUser(LOCAL_USER_ID)).toEqual([jiraSplit(true)]);
  });
});

describe('split hide tasks migration', () => {
  it('turns the flag off for splits saved before it existed', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0022_split_hide_tasks', directory.path),
    });
    database.sqlite
      .prepare(
        'insert into splits (id, user_id, account_id, name, position, rules, exclusive) values (?, ?, null, ?, 0, ?, 1)',
      )
      .run(JIRA_SPLIT, LOCAL_USER_ID, 'Moje Jira tasky', JSON.stringify(jiraSplit(false).rules));

    migrate(database);

    const splits = await createSqliteRepositories(database).splits.listByUser(LOCAL_USER_ID);
    expect(splits).toEqual([jiraSplit(false)]);
    database.close();
    directory.remove();
  });
});

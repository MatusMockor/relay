import type { JiraEventKind, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const JIRA = { name: 'Jira', email: 'jira@company.test' };

const jiraEvent = (threadId: ThreadId, eventKind: JiraEventKind) => ({
  threadId,
  classification: { jiraKey: 'REL-7', eventKind, actor: null },
  title: '[REL-7] Platby padajú',
});

const twoThreads = async (engine: TestEngine): Promise<[ThreadId, ThreadId]> => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Prvé' });
  deliverMail(server, 'INBOX', { id: 'm2', subject: 'Druhé' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 });
  return [present(page.items[0]).id, present(page.items[1]).id];
};

const tasks = async (engine: TestEngine) =>
  (await engine.services.tasks.list(USER_ID, { limit: 20 })).items;

describe('Jira task routing by the user settings', () => {
  it('creates an open task for a mention by default', async () => {
    const engine = createTestEngine();
    const [thread] = await twoThreads(engine);

    const task = await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(thread, 'mention'));

    expect(task).toMatchObject({ jiraKey: 'REL-7', state: 'open', threadId: thread });
    expect(engine.events.ofType('task.upserted')).toHaveLength(1);
  });

  it('reopens an existing task and moves it to the newest thread for a mention', async () => {
    const engine = createTestEngine();
    const [first, second] = await twoThreads(engine);
    const created = present(
      await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(first, 'assigned')),
    );
    await engine.services.tasks.update(USER_ID, created.id, { state: 'done' });

    await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(second, 'mention'));

    expect(await tasks(engine)).toEqual([
      expect.objectContaining({ id: created.id, state: 'open', threadId: second }),
    ]);
  });

  it('creates no task for other changes by default', async () => {
    const engine = createTestEngine();
    const [thread] = await twoThreads(engine);

    const task = await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(thread, 'other'));

    expect(task).toBeNull();
    expect(await tasks(engine)).toEqual([]);
    expect(engine.events.ofType('task.upserted')).toEqual([]);
  });

  it('leaves an existing task untouched for an event kind that is not routed to tasks', async () => {
    const engine = createTestEngine();
    const [first, second] = await twoThreads(engine);
    const created = present(
      await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(first, 'mention')),
    );
    const done = await engine.services.tasks.update(USER_ID, created.id, { state: 'done' });
    engine.events.clear();

    for (const kind of ['comment', 'status', 'other'] as const) {
      expect(
        await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(second, kind)),
      ).toBeNull();
    }

    expect(await tasks(engine)).toEqual([done]);
    expect(engine.events.ofType('task.upserted')).toEqual([]);
  });

  it('follows the Jira event kinds the user picked', async () => {
    const engine = createTestEngine();
    const [first, second] = await twoThreads(engine);
    await engine.services.settings.update(USER_ID, { jira: { taskEvents: ['other'] } });

    expect(
      await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(first, 'mention')),
    ).toBeNull();
    const task = await engine.services.tasks.applyJiraEvent(USER_ID, jiraEvent(second, 'other'));

    expect(task).toMatchObject({ state: 'open', threadId: second });
  });

  it('keeps a synced Jira update out of the tasks view and clears its pending work', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[REL-8] Sprint',
      headers: { 'X-Jira-Event': 'other' },
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await tasks(engine)).toEqual([]);
    const view = await engine.services.inbox.list(USER_ID, { view: 'tasks', limit: 5 });
    expect(view.items).toEqual([]);
    const inbox = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 });
    expect(inbox.items.map((thread) => thread.jiraKey)).toEqual(['REL-8']);
    expect(await engine.repositories.pendingWork.list(account.id, 'jira-event')).toEqual([]);
  });
});

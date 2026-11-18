import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { enableJiraTasks } from '../support/automations';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('TaskService', () => {
  it('creates AI tasks, filters by state and pages results', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 })).items[0],
    );

    const first = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: thread.id,
      title: '  Poslať ponuku  ',
      aiWhat: 'Klient čaká na ponuku',
    });
    engine.clock.advance(1_000);
    await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'Zavolať',
      aiWhat: null,
    });
    await engine.services.tasks.update(USER_ID, first.id, { state: 'waiting' });

    expect(first).toMatchObject({
      title: 'Poslať ponuku',
      source: 'ai',
      state: 'open',
      threadId: thread.id,
    });
    const waiting = await engine.services.tasks.list(USER_ID, { state: 'waiting', limit: 50 });
    expect(waiting.items.map((task) => task.id)).toEqual([first.id]);
    const page = await engine.services.tasks.list(USER_ID, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const tasksView = await engine.services.inbox.list(USER_ID, { view: 'tasks', limit: 50 });
    expect(tasksView.items.map((item) => item.id)).toEqual([thread.id]);
    expect(engine.events.ofType('task.upserted')).toHaveLength(3);
  });

  it('rejects empty titles, unknown threads and foreign tasks', async () => {
    const engine = createTestEngine();
    const task = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'A',
      aiWhat: null,
    });

    await expect(
      engine.services.tasks.createFromAi(USER_ID, { threadId: null, title: '   ', aiWhat: null }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      engine.services.tasks.createFromAi(USER_ID, {
        threadId: 'thread_x' as ThreadId,
        title: 'B',
        aiWhat: null,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.tasks.update('user_bob' as typeof USER_ID, task.id, { state: 'done' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps a title edited while a Jira event updates the task', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await enableJiraTasks(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      from: { name: 'Jira', email: 'jira@company.test' },
      subject: '[REL-3] Fix login',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const task = present((await engine.services.tasks.list(USER_ID, { limit: 5 })).items[0]);
    await engine.services.tasks.update(USER_ID, task.id, { state: 'done' });

    await Promise.all([
      engine.services.tasks.applyJiraEvent(USER_ID, {
        threadId: present(task.threadId),
        classification: { jiraKey: 'REL-3', eventKind: 'mention', actor: null },
        title: '[REL-3] Fix login',
      }),
      engine.services.tasks.update(USER_ID, task.id, { title: 'Opraviť prihlásenie' }),
    ]);

    expect(await engine.repositories.tasks.findById(USER_ID, task.id)).toMatchObject({
      title: 'Opraviť prihlásenie',
      state: 'open',
    });
  });

  it('creates one task when two events of a new Jira issue arrive together', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 })).items[0],
    );
    const event = {
      threadId: thread.id,
      classification: { jiraKey: 'REL-9', eventKind: 'mention', actor: null },
      title: '[REL-9] Export',
    } as const;

    const [first, second] = await Promise.all([
      engine.services.tasks.applyJiraEvent(USER_ID, event),
      engine.services.tasks.applyJiraEvent(USER_ID, event),
    ]);

    expect(present(second).id).toBe(present(first).id);
    const page = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(page.items.map((task) => task.jiraKey)).toEqual(['REL-9']);
  });
});

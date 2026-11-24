import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const syncedThread = async (engine: ReturnType<typeof createTestEngine>) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  return present((await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 })).items[0]);
};

describe('TaskService priorities', () => {
  it('stores the priority an AI suggests and none when it suggests nothing', async () => {
    const engine = createTestEngine();

    const urgent = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'Opraviť výpadok',
      aiWhat: null,
      priority: 'urgent',
    });
    const plain = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'Zavolať Jane',
      aiWhat: null,
    });

    expect(urgent.priority).toBe('urgent');
    expect(plain.priority).toBe('none');
  });

  it('changes only the priority, announces the change and lists tasks by priority', async () => {
    const engine = createTestEngine();
    const low = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'Upratať štítky',
      aiWhat: 'Kedykoľvek',
      priority: 'low',
    });
    engine.clock.advance(1_000);
    const plain = await engine.services.tasks.createFromAi(USER_ID, {
      threadId: null,
      title: 'Poslať ponuku',
      aiWhat: null,
    });
    engine.clock.advance(1_000);
    engine.events.clear();

    const updated = await engine.services.tasks.update(USER_ID, plain.id, { priority: 'high' });

    expect(updated).toMatchObject({
      id: plain.id,
      title: 'Poslať ponuku',
      state: 'open',
      priority: 'high',
    });
    expect(engine.events.ofType('task.upserted').map((event) => event.data.task.priority)).toEqual([
      'high',
    ]);
    const page = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(page.items.map((task) => task.id)).toEqual([plain.id, low.id]);
  });

  it('creates Jira tasks without a priority and keeps a chosen one when the issue comes back', async () => {
    const engine = createTestEngine();
    const thread = await syncedThread(engine);
    const event = {
      threadId: thread.id,
      classification: { jiraKey: 'REL-4', eventKind: 'assigned', actor: null },
      title: '[REL-4] Export',
    } as const;
    const created = present(await engine.services.tasks.applyJiraEvent(USER_ID, event));
    await engine.services.tasks.update(USER_ID, created.id, { priority: 'medium', state: 'done' });

    const reopened = present(await engine.services.tasks.applyJiraEvent(USER_ID, event));

    expect(created.priority).toBe('none');
    expect(reopened).toMatchObject({ id: created.id, state: 'open', priority: 'medium' });
  });
});

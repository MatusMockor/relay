import type { SplitId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { enableJiraTasks } from '../support/automations';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const JIRA = { name: 'Jira', email: 'jira@company.atlassian.test' };

describe('SyncService classification', () => {
  it('creates one task per Jira key and updates its state', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await enableJiraTasks(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[REL-12] Payment page crashes',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const page = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(page.items).toHaveLength(1);
    const task = present(page.items[0]);
    expect(task).toMatchObject({
      jiraKey: 'REL-12',
      title: 'Payment page crashes',
      state: 'open',
      source: 'jira',
    });
    const [thread] = (await engine.services.inbox.list(USER_ID, { view: 'tasks', limit: 50 }))
      .items;
    expect(thread?.jiraKey).toBe('REL-12');
    expect(task.threadId).toBe(thread?.id);
    await engine.services.tasks.update(USER_ID, task.id, { state: 'done' });

    deliverMail(server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[REL-12] Payment page crashes',
      headers: { 'X-Jira-Event': 'mention' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const after = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ id: task.id, state: 'open' });
    expect(engine.events.ofType('task.upserted').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the task state for status-only Jira updates', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await enableJiraTasks(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[OPS-7] Rotate keys',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const task = present((await engine.services.tasks.list(USER_ID, { limit: 50 })).items[0]);
    await engine.services.tasks.update(USER_ID, task.id, { state: 'waiting' });

    deliverMail(server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[OPS-7] Rotate keys',
      headers: { 'X-Jira-Event': 'status' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const [updated] = (await engine.services.tasks.list(USER_ID, { limit: 50 })).items;
    expect(updated?.state).toBe('waiting');
  });

  it('assigns split membership to new threads and hides exclusive splits from the inbox', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await engine.repositories.splits.replaceAll(USER_ID, [
      {
        id: 'split_partners' as SplitId,
        userId: USER_ID,
        accountId: null,
        name: 'Partneri',
        order: 0,
        match: 'any',
        rules: [{ type: 'fromDomain', domain: 'partner.test' }],
        exceptions: [],
        exclusive: true,
        hideTasks: false,
      },
    ]);
    deliverMail(server, 'INBOX', { id: 'p1' });
    deliverMail(server, 'INBOX', { id: 'o1', from: { name: null, email: 'news@other.test' } });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const split = await engine.services.inbox.list(USER_ID, {
      view: 'inbox',
      splitId: 'split_partners' as SplitId,
      limit: 50,
    });
    expect(split.items.map((thread) => thread.subject)).toEqual(['Subject p1']);
    expect(split.items[0]?.splitIds).toEqual(['split_partners']);
    const main = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(main.items.map((thread) => thread.subject)).toEqual(['Subject o1']);
  });
});

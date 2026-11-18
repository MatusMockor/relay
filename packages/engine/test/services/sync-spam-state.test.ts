import type { FolderView, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  addAutomations,
  automationInput,
  JIRA,
  notifiedSubjects,
  sync,
  syncedSetup,
  TIBOR,
} from '../support/automations';
import {
  deliverMail,
  type MailSpec,
  messageHeader,
  present,
  seedAccount,
} from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const viewIds = async (engine: TestEngine, view: FolderView): Promise<ThreadId[]> =>
  (await engine.services.inbox.list(USER_ID, { view, limit: 50 })).items.map((item) => item.id);

const spamAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Spam', 'spam');
  return seeded;
};

const onlyThreadId = (engine: TestEngine): ThreadId => {
  const ids = [...engine.db.tables.threads.keys()];
  expect(ids).toHaveLength(1);
  return ids[0] ?? ('missing' as ThreadId);
};

describe('SyncService with the spam mailbox', () => {
  it('keeps mail from the spam mailbox in the spam view only', async () => {
    const engine = createTestEngine();
    const { account, server } = await spamAccount(engine);
    deliverMail(server, 'Spam', { id: 's1', subject: 'Vyhrali ste', date: DATE });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const threadId = onlyThreadId(engine);
    expect(await viewIds(engine, 'spam')).toEqual([threadId]);
    for (const view of ['inbox', 'done', 'trash', 'tasks', 'sent'] as const) {
      expect(await viewIds(engine, view)).toEqual([]);
    }
  });

  it('creates no Jira task from Jira mail that landed in spam', async () => {
    const engine = createTestEngine();
    const { account, server } = await spamAccount(engine);
    deliverMail(server, 'Spam', {
      id: 'j1',
      from: JIRA,
      subject: '[REL-9] Platby padajú',
      headers: { 'X-Jira-Event': 'mention' },
      date: DATE,
    });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(true);
    const spam = present(await engine.repositories.mailboxes.findByRole(account.id, 'spam'));
    const stored = [...engine.db.tables.messages.values()].filter(
      (message) => message.mailboxId === spam.id,
    );
    expect(stored.map((message) => message.messageIdHeader)).toEqual([messageHeader('j1')]);
    expect((await engine.services.tasks.list(USER_ID, { limit: 20 })).items).toEqual([]);
    expect(await engine.repositories.pendingWork.list(account.id, 'jira-event')).toEqual([]);
    expect(await viewIds(engine, 'tasks')).toEqual([]);
  });

  it('runs no automation on new mail arriving in spam', async () => {
    const setup = await syncedSetup();
    setup.server.addMailbox('Spam', 'spam');
    await sync(setup);
    await addAutomations(setup.engine, [automationInput()]);
    deliverMail(setup.server, 'Spam', { id: 'n1', from: TIBOR, subject: 'Podozrivá ponuka' });
    deliverMail(setup.server, 'INBOX', { id: 'n2', from: TIBOR, subject: 'Skutočná ponuka' });

    await sync(setup);

    expect(notifiedSubjects(setup.engine)).toEqual(['Skutočná ponuka']);
  });

  it('follows mail marked as spam and back in another client', async () => {
    const engine = createTestEngine();
    const { account, server } = await spamAccount(engine);
    const spec: MailSpec = { id: 'm1', date: DATE };
    const inboxUid = deliverMail(server, 'INBOX', spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = onlyThreadId(engine);

    server.expunge('INBOX', inboxUid);
    const spamUid = deliverMail(server, 'Spam', spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'spam')).toEqual([threadId]);
    expect(await viewIds(engine, 'inbox')).toEqual([]);

    server.expunge('Spam', spamUid);
    deliverMail(server, 'INBOX', spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'inbox')).toEqual([threadId]);
    expect(await viewIds(engine, 'spam')).toEqual([]);
  });
});

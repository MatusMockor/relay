import type { FolderView, Mailbox, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { JIRA } from '../support/automations';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const OLD = '2025-01-10T08:00:00.000Z';

const folderSetup = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Projekty', 'custom');
  seeded.server.addMailbox('Projekty/Alfa', 'custom');
  return seeded;
};

const mailboxAt = async (engine: TestEngine, accountId: Mailbox['accountId'], path: string) =>
  present(await engine.repositories.mailboxes.findByPath(accountId, path));

const viewIds = async (
  engine: TestEngine,
  view: FolderView,
  mailbox?: Mailbox,
): Promise<ThreadId[]> =>
  (
    await engine.services.inbox.list(USER_ID, { view, mailboxId: mailbox?.id, limit: 50 })
  ).items.map((item) => item.id);

const onlyThreadId = (engine: TestEngine): ThreadId => {
  const ids = [...engine.db.tables.threads.keys()];
  expect(ids).toHaveLength(1);
  return present(ids[0]);
};

describe('SyncService with custom folders', () => {
  it('shows mail of a subscribed folder in its folder view and archive', async () => {
    const engine = createTestEngine();
    const { account, server } = await folderSetup(engine);
    deliverMail(server, 'Projekty/Alfa', { id: 'f1', subject: 'Zmluva', date: DATE });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const threadId = onlyThreadId(engine);
    const alfa = await mailboxAt(engine, account.id, 'Projekty/Alfa');
    expect(alfa.subscribed).toBe(true);
    expect(await viewIds(engine, 'mailbox', alfa)).toEqual([threadId]);
    expect(
      await viewIds(engine, 'mailbox', await mailboxAt(engine, account.id, 'Projekty')),
    ).toEqual([]);
    expect(await viewIds(engine, 'inbox')).toEqual([]);
    expect(await viewIds(engine, 'archive')).toEqual([threadId]);
    expect(await viewIds(engine, 'done')).toEqual([]);
  });

  it('skips unsubscribed folders unless the server reports no subscriptions at all', async () => {
    const engine = createTestEngine();
    const { account, server } = await folderSetup(engine);
    server.mailbox('Projekty/Alfa').subscribed = false;
    deliverMail(server, 'Projekty/Alfa', { id: 'f1', date: DATE });

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.db.tables.threads.size).toBe(0);

    server.mailboxes.forEach((mailbox) => (mailbox.subscribed = false));
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.db.tables.threads.size).toBe(1);
  });

  it('downloads only the newest messages of a folder, regardless of their age', async () => {
    const engine = createTestEngine({ sync: { initialFolderMessageLimit: 2 } });
    const { account, server } = await folderSetup(engine);
    ['o1', 'o2', 'o3'].forEach((id) => deliverMail(server, 'Projekty', { id, date: OLD }));

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const subjects = [...engine.db.tables.messages.values()].map((message) => message.subject);
    expect(subjects.sort()).toEqual(['Subject o2', 'Subject o3']);
  });

  it('creates no Jira task and no inbox arrival from mail filed in a folder', async () => {
    const engine = createTestEngine();
    const { account, server } = await folderSetup(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    deliverMail(server, 'Projekty', {
      id: 'j1',
      from: JIRA,
      subject: '[REL-9] Platby padajú',
      headers: { 'X-Jira-Event': 'mention' },
      date: DATE,
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await engine.repositories.pendingWork.list(account.id, 'jira-event')).toEqual([]);
    expect((await engine.services.tasks.list(USER_ID, { limit: 20 })).items).toEqual([]);
    expect(await viewIds(engine, 'inbox')).toEqual([]);
  });

  it('marks a thread done when another client files it from the inbox into a folder', async () => {
    const engine = createTestEngine();
    const { account, server } = await folderSetup(engine);
    const uid = deliverMail(server, 'INBOX', { id: 'm1', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = onlyThreadId(engine);

    const record = server.record('INBOX', uid);
    server.deliver('Projekty', record.source, { internalDate: record.internalDate });
    server.expunge('INBOX', uid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const projekty = await mailboxAt(engine, account.id, 'Projekty');
    expect(present(engine.db.tables.threads.get(threadId)).state).toBe('done');
    expect(await viewIds(engine, 'mailbox', projekty)).toEqual([threadId]);
    expect(engine.db.tables.threads.size).toBe(1);
  });

  it('skips folders that did not change since the last pass', async () => {
    const engine = createTestEngine();
    const { account, server } = await folderSetup(engine);
    deliverMail(server, 'Projekty', { id: 'f1', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.uidListings.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(server.uidListings).toEqual([]);

    deliverMail(server, 'Projekty', { id: 'f2', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(server.uidListings).toEqual(['Projekty']);
    expect(engine.db.tables.messages.size).toBe(2);
  });
});

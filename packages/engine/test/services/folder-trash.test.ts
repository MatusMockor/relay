import type { Mailbox, ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const folderThread = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  server.addMailbox('Junk', 'spam');
  server.addMailbox('Faktúry', 'custom');
  deliverMail(server, 'Faktúry', { id: 'f1', subject: 'Faktúra 12', date: DATE });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present([...engine.db.tables.threads.values()][0]);
  const folder = present(await engine.repositories.mailboxes.findByPath(account.id, 'Faktúry'));
  return { account, server, thread, folder };
};

const folderIds = async (engine: TestEngine, folder: Mailbox) =>
  (
    await engine.services.inbox.list(USER_ID, { view: 'mailbox', mailboxId: folder.id, limit: 20 })
  ).items.map((item) => item.id);

const apply = (engine: TestEngine, thread: ThreadSummary, type: 'trash' | 'restore') =>
  engine.services.actions.apply(USER_ID, thread.id, { type });

describe('trash and spam for mail filed in a custom folder', () => {
  it('moves the folder copy to trash and restores it to the same folder', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await folderThread(engine);

    expect((await apply(engine, thread, 'trash')).state).toBe('trash');
    expect(server.mailbox('Faktúry').messages.size).toBe(0);
    expect(server.mailbox('Trash').messages.size).toBe(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(present(engine.db.tables.threads.get(thread.id)).state).toBe('trash');

    expect((await apply(engine, thread, 'restore')).state).toBe('done');
    expect(server.mailbox('Faktúry').messages.size).toBe(1);
    expect(server.mailbox('Trash').messages.size).toBe(0);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await folderIds(engine, folder)).toEqual([thread.id]);
  });

  it('restores to the inbox when the original folder is gone', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await folderThread(engine);
    await apply(engine, thread, 'trash');
    server.removeMailbox('Faktúry');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await apply(engine, thread, 'restore');

    expect(server.mailbox('INBOX').messages.size).toBe(1);
    expect(server.mailbox('Trash').messages.size).toBe(0);
  });

  it('reports folder mail as spam and returns it to the folder on not spam', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await folderThread(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' });
    expect(server.mailbox('Junk').messages.size).toBe(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'notSpam' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.mailbox('Faktúry').messages.size).toBe(1);
    expect(present(engine.db.tables.threads.get(thread.id)).state).toBe('done');
    expect(await folderIds(engine, folder)).toEqual([thread.id]);
  });
});

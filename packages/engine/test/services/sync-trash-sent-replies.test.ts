import { describe, expect, it } from 'vitest';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

describe('SyncService trash state next to sent replies', () => {
  it('moves a thread to the trash view when its received mail is trashed and the reply stays in Sent', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const inboxUid = deliverMail(server, 'INBOX', { id: 'm1', date: DATE });
    deliverMail(server, 'Sent', {
      id: 'r1',
      from: ME,
      inReplyTo: 'm1',
      references: ['m1'],
      date: '2026-11-14T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present([...engine.db.tables.threads.values()][0]);

    server.expunge('INBOX', inboxUid);
    deliverMail(server, 'Trash', { id: 'm1', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 });
    expect(trash.items.map((item) => item.id)).toEqual([thread.id]);
    const done = await engine.services.inbox.list(USER_ID, { view: 'done', limit: 50 });
    expect(done.items).toEqual([]);
  });
});

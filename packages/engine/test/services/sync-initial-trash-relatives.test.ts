import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, seedAccount } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const OLD: MailSpec = { id: 'm1', subject: 'Plan', date: '2026-08-01T08:00:00.000Z' };

const TRASHED_REPLY: MailSpec = {
  id: 'r1',
  subject: 'Re: Plan',
  inReplyTo: 'm1',
  references: ['m1'],
  date: '2026-11-14T08:00:00.000Z',
};

const states = (engine: TestEngine) =>
  [...engine.db.tables.threads.values()].map((thread) => [thread.state, thread.messageCount]);

describe('SyncService initial sync of trashed replies to older mail', () => {
  it('keeps a thread in the inbox when its older message is still in INBOX', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', OLD);
    deliverMail(server, 'Trash', TRASHED_REPLY);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['inbox', 2]]);
  });

  it('keeps a Gmail thread in the inbox when its older message has the inbox label', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', OLD);
    deliverMail(server, 'Archive', OLD);
    deliverMail(server, 'Trash', TRASHED_REPLY);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['inbox', 2]]);
  });

  it('files a thread as done when its older message is only archived', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Archive', OLD);
    deliverMail(server, 'Trash', TRASHED_REPLY);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['done', 2]]);
  });

  it('pulls a newer reply that still sits outside the inbox window', async () => {
    const engine = createTestEngine({ sync: { initialMessageLimit: 1 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Trash', { id: 'm1', date: '2026-11-13T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { ...TRASHED_REPLY, id: 'r2' });
    deliverMail(server, 'INBOX', { id: 'other', date: '2026-11-14T10:00:00.000Z' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine).sort()).toEqual([
      ['inbox', 1],
      ['inbox', 2],
    ]);
  });
});

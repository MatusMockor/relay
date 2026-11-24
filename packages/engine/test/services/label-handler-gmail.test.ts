import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};
const FIRST: MailSpec = { id: 'g1', labels: ['\\Inbox'], emailId: 'gm-1', date: DATE };
const SECOND: MailSpec = { id: 'g2', inReplyTo: 'g1', emailId: 'gm-2', date: DATE };

const gmailThread = async (engine: TestEngine, deliver: (server: FakeMailServer) => void) => {
  const { account, server } = await seedAccount(
    engine,
    { settings: GMAIL_SETTINGS },
    { gmail: true },
  );
  server.addMailbox('Klienti', 'label', 501);
  deliver(server);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const threads = [...engine.db.tables.threads.values()];
  expect(threads).toHaveLength(1);
  const label = present(
    await engine.repositories.labels.findByRemoteName(account.id, 'gmail', 'Klienti'),
  );
  return { account, server, thread: present(threads[0]), label };
};

const localLabels = (engine: TestEngine) =>
  [...engine.db.tables.messages.values()].map((message) => message.labelIds);

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

describe('labelling a Gmail thread', () => {
  it('labels every local copy and writes once per physical message, preferring All Mail', async () => {
    const engine = createTestEngine();
    const { account, server, thread, label } = await gmailThread(engine, (gmail) => {
      deliverMail(gmail, 'INBOX', FIRST);
      deliverMail(gmail, 'Archive', FIRST);
      deliverMail(gmail, 'INBOX', SECOND);
      deliverMail(gmail, 'Archive', SECOND);
    });

    const labelled = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });

    expect(labelled.state).toBe('inbox');
    expect(labelled.labelIds).toEqual([label.id]);
    expect(localLabels(engine)).toEqual([[label.id], [label.id]]);
    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [1, 2], add: ['Klienti'], remove: [] },
    ]);
    expect(server.record('INBOX', 1).labels).toEqual(['\\Inbox', 'Klienti']);
    expect(pendingOps(engine)).toEqual([]);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(localLabels(engine)).toEqual([[label.id], [label.id]]);
  });

  it('removes the label from every copy with one write per message', async () => {
    const engine = createTestEngine();
    const tagged: MailSpec = { ...FIRST, labels: ['\\Inbox', 'Klienti'] };
    const { account, server, thread, label } = await gmailThread(engine, (gmail) => {
      deliverMail(gmail, 'INBOX', tagged);
      deliverMail(gmail, 'Archive', tagged);
    });
    expect(localLabels(engine)).toEqual([[label.id]]);

    const cleared = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'removeLabel',
      labelId: label.id,
    });

    expect(cleared.labelIds).toEqual([]);
    expect(localLabels(engine)).toEqual([[]]);
    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [1], add: [], remove: ['Klienti'] },
    ]);
    expect(server.record('INBOX', 1).labels).toEqual(['\\Inbox']);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(localLabels(engine)).toEqual([[]]);
  });

  it('writes to the inbox copy when the message has no All Mail copy yet', async () => {
    const engine = createTestEngine();
    const { server, thread, label } = await gmailThread(engine, (gmail) => {
      deliverMail(gmail, 'INBOX', { ...FIRST, allMail: false });
    });

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });

    expect(server.labelWrites).toEqual([
      { path: 'INBOX', uids: [1], add: ['Klienti'], remove: [] },
    ]);
  });
});

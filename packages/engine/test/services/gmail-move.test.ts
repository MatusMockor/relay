import type { Label, ThreadSummary } from '@relay/shared/domain';
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
  server.addMailbox('Spam', 'spam');
  server.addMailbox('Klienti', 'label', 501);
  deliver(server);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const threads = [...engine.db.tables.threads.values()];
  expect(threads).toHaveLength(1);
  const label = present(
    await engine.repositories.labels.findByRemoteName(account.id, 'gmail', 'Klienti'),
  );
  const target = present(await engine.repositories.mailboxes.findByPath(account.id, 'Klienti'));
  return { account, server, thread: present(threads[0]), label, target };
};

const inboxAndAllMail = (server: FakeMailServer) => {
  deliverMail(server, 'INBOX', FIRST);
  deliverMail(server, 'Archive', FIRST);
};

const count = (server: FakeMailServer, path: string) => server.mailbox(path).messages.size;

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

const threadRefreshes = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'thread-refresh');

const localLabels = (engine: TestEngine) =>
  [...engine.db.tables.messages.values()].map((message) => message.labelIds);

const labelView = async (engine: TestEngine, label: Label) =>
  (
    await engine.services.inbox.list(USER_ID, { view: 'label', labelId: label.id, limit: 20 })
  ).items.map((item) => item.id);

const stored = (engine: TestEngine, thread: ThreadSummary) =>
  present(engine.db.tables.threads.get(thread.id));

describe('moving a Gmail thread to a label', () => {
  it('adds the label once per message and archives by dropping the INBOX placement', async () => {
    const engine = createTestEngine();
    const { account, server, thread, label, target } = await gmailThread(engine, inboxAndAllMail);

    const moved = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: target.id,
    });

    expect(moved.state).toBe('done');
    expect(moved.labelIds).toEqual([label.id]);
    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [1], add: ['Klienti'], remove: [] },
    ]);
    expect(count(server, 'INBOX')).toBe(0);
    expect(server.record('Archive', 1).labels).toEqual(['\\Inbox', 'Klienti']);
    expect(pendingOps(engine)).toEqual([]);
    expect(localLabels(engine)).toEqual([[label.id]]);
    expect(threadRefreshes(engine)).toEqual([]);
    const allMail = present(await engine.repositories.mailboxes.findByPath(account.id, 'Archive'));
    expect([...engine.db.tables.messages.values()].map((message) => message.placements)).toEqual([
      [{ mailboxId: allMail.id, uid: 1 }],
    ]);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(stored(engine, thread).state).toBe('done');
    expect(await labelView(engine, label)).toEqual([thread.id]);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('writes one label operation per physical message, preferring the All Mail copy', async () => {
    const engine = createTestEngine();
    const { server, thread, target } = await gmailThread(engine, (gmail) => {
      inboxAndAllMail(gmail);
      deliverMail(gmail, 'INBOX', SECOND);
      deliverMail(gmail, 'Archive', SECOND);
    });

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: target.id,
    });

    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [1, 2], add: ['Klienti'], remove: [] },
    ]);
    expect(count(server, 'INBOX')).toBe(0);
    expect(pendingOps(engine)).toEqual([]);
  });

  it('labels spam before moving it to All Mail, which takes the thread out of spam', async () => {
    const engine = createTestEngine();
    const { account, server, thread, target } = await gmailThread(engine, (gmail) => {
      deliverMail(gmail, 'Spam', FIRST);
    });
    expect(thread.state).toBe('spam');

    const moved = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: target.id,
    });

    expect(moved.state).toBe('done');
    expect(server.labelWrites.map(({ path }) => path)).toEqual(['Spam']);
    expect(count(server, 'Spam')).toBe(0);
    expect(server.record('Archive', 1).labels).toEqual(['\\Inbox', 'Klienti']);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(stored(engine, thread).state).toBe('done');
  });

  it('undoes the move by removing the label and returning the mail to the inbox', async () => {
    const engine = createTestEngine();
    const { account, server, thread, target } = await gmailThread(engine, inboxAndAllMail);
    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: target.id,
    });

    const undone = await engine.services.actions.apply(USER_ID, thread.id, { type: 'undoMove' });

    expect(undone.state).toBe('inbox');
    expect(undone.labelIds).toEqual([]);
    expect(server.labelWrites.at(-1)).toEqual({
      path: 'Archive',
      uids: [1],
      add: [],
      remove: ['Klienti'],
    });
    expect(count(server, 'INBOX')).toBe(1);
    expect(pendingOps(engine)).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(stored(engine, thread).state).toBe('inbox');
    expect(stored(engine, thread).labelIds).toEqual([]);
  });

  it('archives on done without a unique index failure when Gmail reuses the All Mail UID', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await gmailThread(engine, inboxAndAllMail);
    const allMail = present(await engine.repositories.mailboxes.findByPath(account.id, 'Archive'));

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });

    expect(pendingOps(engine)).toEqual([]);
    expect(count(server, 'INBOX')).toBe(0);
    const rows = [...engine.db.tables.messages.values()];
    expect(rows.map(({ mailboxId, uid }) => ({ mailboxId, uid }))).toEqual([
      { mailboxId: allMail.id, uid: 1 },
    ]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(stored(engine, thread).state).toBe('done');
    expect(threadRefreshes(engine)).toEqual([]);
  });
});

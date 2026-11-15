import { describe, expect, it, vi } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const inboxThreads = async (engine: TestEngine) =>
  (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items;

describe('SyncService incremental sync', () => {
  it('fetches only new UIDs and publishes message events', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', subject: 'Budget', seen: true });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    engine.events.clear();

    deliverMail(server, 'INBOX', {
      id: 'm2',
      subject: 'Re: Budget',
      inReplyTo: 'm1',
      references: ['m1'],
      date: '2026-11-15T09:30:00.000Z',
      body: 'Approved',
    });
    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.newMessages).toBe(1);
    const [thread] = await inboxThreads(engine);
    expect(thread).toMatchObject({ messageCount: 2, unread: true, snippet: 'Approved' });
    expect(
      engine.events.ofType('message.upserted').map((event) => event.data.message.subject),
    ).toEqual(['Re: Budget']);
    expect(engine.events.ofType('thread.upserted')).toHaveLength(1);
    expect(engine.db.tables.messages.size).toBe(2);
  });

  it('brings a done thread back to the inbox when a reply arrives', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present((await inboxThreads(engine))[0]);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    expect(await inboxThreads(engine)).toHaveLength(0);

    deliverMail(server, 'INBOX', { id: 'm2', inReplyTo: 'm1', references: ['m1'] });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await inboxThreads(engine)).map((item) => item.id)).toEqual([thread.id]);
  });

  it('removes expunged messages and recomputes or removes their threads', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const single = deliverMail(server, 'INBOX', { id: 'solo', subject: 'Solo' });
    const first = deliverMail(server, 'INBOX', {
      id: 'a1',
      subject: 'Pair',
      date: '2026-11-14T08:00:00.000Z',
    });
    deliverMail(server, 'INBOX', {
      id: 'a2',
      subject: 'Re: Pair',
      inReplyTo: 'a1',
      date: '2026-11-14T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await inboxThreads(engine)).toHaveLength(2);
    engine.events.clear();

    server.expunge('INBOX', single);
    server.expunge('INBOX', first);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const threads = await inboxThreads(engine);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ subject: 'Re: Pair', messageCount: 1 });
    expect(engine.events.ofType('thread.removed')).toHaveLength(1);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('moves a thread to done when another client archives it', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    deliverMail(server, 'Archive', { id: 'm1' });
    server.expunge('INBOX', uid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await inboxThreads(engine)).toHaveLength(0);
    const done = await engine.services.inbox.list(USER_ID, { view: 'done', limit: 50 });
    expect(done.items).toHaveLength(1);
    expect(done.items[0]?.messageCount).toBe(1);
  });

  it('resyncs a mailbox from scratch after a UIDVALIDITY change', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'm2', date: '2026-11-14T09:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    server.expunge('INBOX', 1);
    server.resetUidValidity('INBOX');
    deliverMail(server, 'INBOX', { id: 'm3', date: '2026-11-15T09:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const messages = [...engine.db.tables.messages.values()];
    expect(messages.map((message) => [message.messageIdHeader, message.uid]).sort()).toEqual([
      ['<m2@mail.test>', 1],
      ['<m3@mail.test>', 2],
    ]);
    const mailbox = await engine.repositories.mailboxes.findByRole(account.id, 'inbox');
    const state = mailbox === null ? null : await engine.repositories.syncStates.find(mailbox.id);
    expect(state).toMatchObject({ uidValidity: 2, lastUid: 2 });
    expect((await inboxThreads(engine)).map((thread) => thread.subject).sort()).toEqual([
      'Subject m2',
      'Subject m3',
    ]);
  });

  it('applies flag and keyword changes reported through CONDSTORE', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await inboxThreads(engine))[0]?.unread).toBe(true);

    server.updateFlags('INBOX', uid, { seen: true, flagged: true });
    server.updateKeywords('INBOX', uid, ['Clients', '$Forwarded']);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const [thread] = await inboxThreads(engine);
    expect(thread?.unread).toBe(false);
    const labels = await engine.services.labels.list(USER_ID, { accountId: account.id });
    expect(labels.map((label) => label.name)).toEqual(['Clients']);
    expect(thread?.labelIds).toEqual(labels.map((label) => label.id));
    const [message] = [...engine.db.tables.messages.values()];
    expect(message?.flags).toEqual({ seen: true, flagged: true, answered: false });
  });

  it('rescans all flags when the server has no CONDSTORE', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine, {}, { condstore: false });
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    server.updateFlags('INBOX', uid, { seen: true });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await inboxThreads(engine))[0]?.unread).toBe(false);
  });

  it('keeps the thread identity when another client moves its only message', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const uid = deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present((await inboxThreads(engine))[0]);
    await engine.repositories.threads.setAiOneLiner(thread.id, 'Krátke zhrnutie');

    deliverMail(server, 'Archive', { id: 'm1' });
    server.expunge('INBOX', uid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const done = await engine.services.inbox.list(USER_ID, { view: 'done', limit: 50 });
    expect(done.items.map((item) => [item.id, item.aiOneLiner])).toEqual([
      [thread.id, 'Krátke zhrnutie'],
    ]);
    expect(engine.events.ofType('thread.removed')).toHaveLength(0);
  });

  it('forgets mailboxes deleted on the server', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Trash', { id: 't1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.db.tables.messages.size).toBe(1);

    server.removeMailbox('Trash');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(engine.db.tables.messages.size).toBe(0);
    expect(engine.db.tables.threads.size).toBe(0);
    const roles = (await engine.repositories.mailboxes.listForSync(account.id)).map(
      (box) => box.role,
    );
    expect(roles).not.toContain('trash');
  });

  it('skips messages that cannot be parsed and keeps syncing', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    server.deliver('INBOX', new Uint8Array(), { internalDate: '2026-11-15T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'ok' });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report).toMatchObject({ ok: true, newMessages: 1 });
    expect(engine.logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
  });

  it('runs at most one sync per account and queues one follow-up', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });

    const reports = await Promise.all([
      engine.services.sync.syncAccount(USER_ID, account.id),
      engine.services.sync.syncAccount(USER_ID, account.id),
      engine.services.sync.syncAccount(USER_ID, account.id),
    ]);

    expect(server.connections).toBe(2);
    expect(reports.map((report) => report.ok)).toEqual([true, true, true]);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('syncs when IDLE reports new mail until the watcher is disposed', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const stop = await engine.services.sync.watchAccount(USER_ID, account.id);

    deliverMail(server, 'INBOX', { id: 'pushed' });
    await vi.waitFor(async () => {
      expect(await inboxThreads(engine)).toHaveLength(1);
    });
    await stop();
    deliverMail(server, 'INBOX', { id: 'ignored' });

    expect(server.listeners.size).toBe(0);
    expect(server.openConnections).toBe(0);
  });
});

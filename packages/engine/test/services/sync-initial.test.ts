import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('SyncService initial sync', () => {
  it('imports mailboxes, threads messages and builds thread summaries', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', {
      id: 'm1',
      subject: 'Kickoff',
      date: '2026-11-14T08:00:00.000Z',
    });
    deliverMail(server, 'INBOX', {
      id: 'm2',
      subject: 'Re: Kickoff',
      from: { name: 'Jana Mala', email: 'jana@partner.test' },
      date: '2026-11-14T09:00:00.000Z',
      inReplyTo: 'm1',
      references: ['m1'],
      body: 'Latest reply',
      seen: true,
    });
    deliverMail(server, 'Sent', {
      id: 'm3',
      subject: 'Lunch?',
      from: ME,
      to: [{ name: null, email: 'bob@friends.test' }],
      date: '2026-11-13T12:00:00.000Z',
      seen: true,
    });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report).toMatchObject({ ok: true, error: null, newMessages: 3 });
    const mailboxes = await engine.repositories.mailboxes.listByAccount(USER_ID, account.id);
    expect(mailboxes.map((mailbox) => mailbox.role).sort()).toEqual([
      'archive',
      'inbox',
      'sent',
      'trash',
    ]);
    const inbox = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      subject: 'Kickoff',
      messageCount: 2,
      unread: true,
      snippet: 'Latest reply',
      lastMessageAt: '2026-11-14T09:00:00.000Z',
      state: 'inbox',
    });
    expect(inbox.items[0]?.participants.map((address) => address.email)).toEqual([
      'peter@partner.test',
      ME.email,
      'jana@partner.test',
    ]);
    const done = await engine.services.inbox.list(USER_ID, { view: 'done', limit: 50 });
    expect(done.items.map((thread) => thread.subject)).toEqual(['Lunch?']);
    const sent = await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 });
    expect(sent.items.map((thread) => thread.subject)).toEqual(['Lunch?']);
  });

  it('reports status and progress without per-message events', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const statuses = engine.events.ofType('account.status').map((event) => event.data.status);
    expect(statuses).toEqual(['syncing', 'connected']);
    const phases = engine.events.ofType('sync.progress').map((event) => event.data.phase);
    expect(phases[0]).toBe('connecting');
    expect(phases).toContain('mailboxes');
    expect(phases).toContain('messages');
    expect(phases.at(-1)).toBe('idle');
    expect(engine.events.ofType('message.upserted')).toHaveLength(0);
    expect(engine.events.ofType('thread.upserted')).toHaveLength(1);
    const stored = await engine.repositories.accounts.findById(USER_ID, account.id);
    expect(stored).toMatchObject({
      status: 'connected',
      lastError: null,
      lastSyncedAt: '2026-11-15T10:00:00.000Z',
    });
    expect(server.openConnections).toBe(0);
  });

  it('bounds the initial sync by message count and age window', async () => {
    const engine = createTestEngine({ sync: { initialMessageLimit: 3, initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'ancient', date: '2026-01-01T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'old', date: '2026-09-01T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'recent-1', date: '2026-11-10T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'recent-2', date: '2026-11-11T08:00:00.000Z' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const inbox = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(inbox.items.map((thread) => thread.subject).sort()).toEqual([
      'Subject recent-1',
      'Subject recent-2',
    ]);
    const mailbox = await engine.repositories.mailboxes.findByRole(account.id, 'inbox');
    const state = mailbox === null ? null : await engine.repositories.syncStates.find(mailbox.id);
    expect(state).toMatchObject({ uidValidity: 1, lastUid: 4 });
    expect(state?.highestModseq).not.toBeNull();
  });

  it('counts existing messages, not UIDs, for the initial window', async () => {
    const engine = createTestEngine({ sync: { initialMessageLimit: 2 } });
    const { account, server } = await seedAccount(engine);
    const gaps = Array.from({ length: 10 }, (_, index) =>
      deliverMail(server, 'INBOX', { id: `gap${index}` }),
    );
    deliverMail(server, 'INBOX', { id: 'a' });
    deliverMail(server, 'INBOX', { id: 'b' });
    deliverMail(server, 'INBOX', { id: 'c' });
    gaps.forEach((uid) => {
      server.expunge('INBOX', uid);
    });
    const later = Array.from({ length: 10 }, (_, index) =>
      deliverMail(server, 'INBOX', { id: `late${index}` }),
    );
    later.forEach((uid) => {
      server.expunge('INBOX', uid);
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const subjects = [...engine.db.tables.threads.values()].map((thread) => thread.subject).sort();
    expect(subjects).toEqual(['Subject b', 'Subject c']);
  });

  it('marks the account as failed when the provider rejects the login', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    await engine.vault.set(account.id, { kind: 'password', password: 'wrong' });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(false);
    expect(report.error).toContain('Authentication failed');
    const stored = await engine.repositories.accounts.findById(USER_ID, account.id);
    expect(stored).toMatchObject({ status: 'error' });
    expect(stored?.lastError).toContain('Authentication failed');
    expect(engine.events.ofType('account.status').at(-1)?.data.status).toBe('error');
  });

  it('rejects unknown accounts', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    await expect(
      engine.services.sync.syncAccount('user_mallory' as typeof USER_ID, account.id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

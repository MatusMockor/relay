import type { ThreadState, ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

type View = 'inbox' | 'done' | 'archive' | 'trash' | 'sent';

const viewIds = async (engine: TestEngine, view: View) =>
  (await engine.services.inbox.list(USER_ID, { view, limit: 50 })).items.map((item) => item.id);

const upsertedStates = (engine: TestEngine): ThreadState[] =>
  engine.events.ofType('thread.upserted').map((event) => event.data.thread.state);

type Copy = readonly [path: string, uid: number];

const allMail = (server: FakeMailServer, paths: readonly string[], spec: MailSpec): Copy[] =>
  paths.map((path) => [path, deliverMail(server, path, spec)]);

const copiesIn = (server: FakeMailServer, paths: readonly string[]): Copy[] =>
  paths.flatMap((path) => [...server.mailbox(path).messages.keys()].map((uid) => [path, uid]));

const gmailDelete = (server: FakeMailServer, copies: readonly Copy[], spec: MailSpec) => {
  copies.forEach(([path, uid]) => {
    server.expunge(path, uid);
  });
  return deliverMail(server, 'Trash', spec);
};

const syncedGmailThread = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  const spec: MailSpec = { id: 'm1', date: '2026-11-14T08:00:00.000Z' };
  const uids = allMail(seeded.server, ['INBOX', 'Archive'], spec);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const thread: ThreadSummary = present(
    (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items[0],
  );
  return { ...seeded, uids, spec, thread };
};

describe('SyncService trash state from the mail provider', () => {
  it('moves a thread deleted in another client to the trash view', async () => {
    const engine = createTestEngine();
    const { account, server, uids, spec, thread } = await syncedGmailThread(engine);
    engine.events.clear();

    gmailDelete(server, uids, spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);
    expect(await viewIds(engine, 'inbox')).toEqual([]);
    expect(upsertedStates(engine)).not.toContain('done');
    expect(upsertedStates(engine).at(-1)).toBe('trash');
  });

  it('moves a done thread deleted in another client to the trash view', async () => {
    const engine = createTestEngine();
    const { account, server, spec, thread } = await syncedGmailThread(engine);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'done')).toEqual([thread.id]);

    gmailDelete(server, copiesIn(server, ['INBOX', 'Archive']), spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);
    expect(await viewIds(engine, 'done')).toEqual([]);
  });

  it('brings a thread restored in another client back to the inbox', async () => {
    const engine = createTestEngine();
    const { account, server, uids, spec, thread } = await syncedGmailThread(engine);
    const trashUid = gmailDelete(server, uids, spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    engine.events.clear();

    allMail(server, ['INBOX', 'Archive'], spec);
    server.expunge('Trash', trashUid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'inbox')).toEqual([thread.id]);
    expect(await viewIds(engine, 'trash')).toEqual([]);
    expect(upsertedStates(engine)).not.toContain('trash');
  });

  it('archives a thread restored without the inbox label', async () => {
    const engine = createTestEngine();
    const { account, server, uids, spec, thread } = await syncedGmailThread(engine);
    const trashUid = gmailDelete(server, uids, spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    deliverMail(server, 'Archive', spec);
    server.expunge('Trash', trashUid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'archive')).toEqual([thread.id]);
    expect(await viewIds(engine, 'done')).toEqual([]);
    expect(await viewIds(engine, 'trash')).toEqual([]);
  });

  it('keeps a partly deleted thread where it was', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedGmailThread(engine);
    const reply: MailSpec = {
      id: 'm2',
      inReplyTo: 'm1',
      references: ['m1'],
      date: '2026-11-14T09:00:00.000Z',
    };
    const replyUids = allMail(server, ['INBOX', 'Archive'], reply);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'inbox')).toEqual([thread.id]);

    gmailDelete(server, replyUids, reply);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'inbox')).toEqual([thread.id]);
    expect(await viewIds(engine, 'trash')).toEqual([]);
    const current = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(current?.messageCount).toBe(2);
  });

  it('takes a sent thread restored from the trash out of the trash view', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const spec: MailSpec = { id: 's1', from: ME, date: '2026-11-14T08:00:00.000Z' };
    const sentUid = deliverMail(server, 'Sent', spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 })).items[0],
    );

    const trashUid = gmailDelete(server, [['Sent', sentUid]], spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);

    deliverMail(server, 'Sent', spec);
    server.expunge('Trash', trashUid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'trash')).toEqual([]);
    expect(await viewIds(engine, 'sent')).toEqual([thread.id]);
    expect(await viewIds(engine, 'done')).toEqual([]);
  });

  it('takes a sent thread restored from the Gmail trash out of the trash view', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    const spec: MailSpec = { id: 's1', from: ME, date: '2026-11-14T08:00:00.000Z' };
    const copies = allMail(server, ['Sent', 'Archive'], spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 })).items[0],
    );

    const trashUid = gmailDelete(server, copies, spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);

    allMail(server, ['Sent', 'Archive'], spec);
    server.expunge('Trash', trashUid);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'trash')).toEqual([]);
    expect(await viewIds(engine, 'sent')).toEqual([thread.id]);
  });

  it('keeps a sent-only thread trashed locally in the trash view across syncs', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', from: ME, date: '2026-11-14T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 })).items[0],
    );

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    expect(copiesIn(server, ['Sent'])).toEqual([]);
    const trashUid = present(copiesIn(server, ['Trash'])[0])[1];
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.updateFlags('Trash', trashUid, { seen: true });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);
    expect(await viewIds(engine, 'sent')).toEqual([]);
  });

  it('restores a sent-only thread back to the sent mailbox', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', from: ME, date: '2026-11-14T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = present(
      (await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 })).items[0],
    );
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(restored.state).toBe('done');
    expect(copiesIn(server, ['Trash', 'INBOX'])).toEqual([]);
    expect(copiesIn(server, ['Sent'])).toHaveLength(1);
    expect(await viewIds(engine, 'sent')).toEqual([thread.id]);
    expect(await viewIds(engine, 'trash')).toEqual([]);
    expect(await viewIds(engine, 'inbox')).toEqual([]);
  });

  it('keeps local trash and restore actions through the next sync', async () => {
    const engine = createTestEngine();
    const { account, thread } = await syncedGmailThread(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'trash')).toEqual([thread.id]);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await viewIds(engine, 'inbox')).toEqual([thread.id]);
    expect(await viewIds(engine, 'trash')).toEqual([]);
  });
});

describe('SyncService initial sync of the trash mailbox', () => {
  it('imports trashed mail received before the age window', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'old-inbox', date: '2026-08-01T08:00:00.000Z' });
    deliverMail(server, 'Trash', { id: 'old-trash', date: '2026-08-01T08:00:00.000Z' });
    deliverMail(server, 'Trash', { id: 'new-trash', date: '2026-11-14T08:00:00.000Z' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 });
    expect(trash.items.map((thread) => thread.subject).sort()).toEqual([
      'Subject new-trash',
      'Subject old-trash',
    ]);
    const subjects = [...engine.db.tables.threads.values()].map((thread) => thread.subject);
    expect(subjects).not.toContain('Subject old-inbox');
  });

  it('still caps the trash mailbox by message count', async () => {
    const engine = createTestEngine({ sync: { initialMessageLimit: 2, initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    ['t1', 't2', 't3'].forEach((id, index) => {
      deliverMail(server, 'Trash', { id, date: `2026-0${String(index + 6)}-01T08:00:00.000Z` });
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 });
    expect(trash.items.map((thread) => thread.subject).sort()).toEqual([
      'Subject t2',
      'Subject t3',
    ]);
  });
});

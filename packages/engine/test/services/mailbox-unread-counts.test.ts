import { describe, expect, it } from 'vitest';
import { present, seedAccount, type SeededAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';
import { deliverUnread } from '../support/unread-mail';

const syncedAccount = async (engine: TestEngine, ids: readonly string[]) => {
  const seeded = await seedAccount(engine);
  deliverUnread(seeded.server, 'INBOX', ids);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  engine.events.clear();
  return seeded;
};

const inboxUnread = async (engine: TestEngine, seeded: SeededAccount): Promise<number> =>
  present(await engine.repositories.mailboxes.findByPath(seeded.account.id, 'INBOX')).unreadCount;

const publishedInboxUnread = (engine: TestEngine): number[] =>
  engine.events
    .ofType('mailboxes.updated')
    .map((event) => present(event.data.mailboxes.find((box) => box.path === 'INBOX')).unreadCount);

const firstThread = async (engine: TestEngine) =>
  present((await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items[0]);

describe('mailbox unread counts after read state changes', () => {
  it('drops the inbox count to zero after marking the folder read', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1', 'm2', 'm3']);
    expect(await inboxUnread(engine, seeded)).toBe(3);

    await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(await inboxUnread(engine, seeded)).toBe(0);
    expect(publishedInboxUnread(engine)).toEqual([0]);
  });

  it('publishes one count per chunk of a big folder', async () => {
    const engine = createTestEngine({ actions: { folderReadPageSize: 2 } });
    const seeded = await syncedAccount(engine, ['m1', 'm2', 'm3']);

    await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(await inboxUnread(engine, seeded)).toBe(0);
    expect(publishedInboxUnread(engine)).toEqual([1, 0]);
  });

  it('decrements on mark read and increments on mark unread', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1', 'm2']);
    const thread = await firstThread(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });
    expect(await inboxUnread(engine, seeded)).toBe(1);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markUnread' });
    expect(await inboxUnread(engine, seeded)).toBe(2);
    expect(publishedInboxUnread(engine)).toEqual([1, 2]);
  });

  it('leaves counts and mailbox events alone for a star', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1']);

    await engine.services.actions.pin(USER_ID, (await firstThread(engine)).id);

    expect(await inboxUnread(engine, seeded)).toBe(1);
    expect(engine.events.ofType('mailboxes.updated')).toEqual([]);
  });

  it('does not count an already read thread twice', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1', 'm2']);
    const thread = await firstThread(engine);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });

    expect(await inboxUnread(engine, seeded)).toBe(1);
  });
});

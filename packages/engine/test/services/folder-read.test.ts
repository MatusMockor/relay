import type { LabelId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount, type SeededAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const deliverUnread = (seeded: SeededAccount, path: string, ids: readonly string[]): void => {
  ids.forEach((id, index) =>
    deliverMail(seeded.server, path, { id, date: `2026-11-14T0${index}:00:00.000Z` }),
  );
};

const syncedAccount = async (
  engine: TestEngine,
  ids: readonly string[],
  overrides: Parameters<typeof seedAccount>[1] = {},
  serverOptions: Parameters<typeof seedAccount>[2] = {},
): Promise<SeededAccount> => {
  const seeded = await seedAccount(engine, overrides, serverOptions);
  deliverUnread(seeded, 'INBOX', ids);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  engine.events.clear();
  return seeded;
};

const unreadInbox = async (engine: TestEngine): Promise<string[]> =>
  (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items
    .filter((thread) => thread.unread)
    .map((thread) => thread.accountId);

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

describe('FolderReadService', () => {
  it('marks every unread inbox thread and mirrors \\Seen', async () => {
    const engine = createTestEngine();
    const { server } = await syncedAccount(engine, ['m1', 'm2', 'm3']);
    const connectionsBefore = server.connections;

    const result = await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(result).toEqual({ count: 3 });
    expect(await unreadInbox(engine)).toEqual([]);
    expect([1, 2, 3].map((uid) => server.record('INBOX', uid).flags.seen)).toEqual([
      true,
      true,
      true,
    ]);
    expect(server.connections - connectionsBefore).toBe(1);
    expect(engine.events.ofType('thread.upserted')).toHaveLength(3);
  });

  it('covers more than one page', async () => {
    const engine = createTestEngine({ actions: { folderReadPageSize: 2 } });
    await syncedAccount(engine, ['m1', 'm2', 'm3', 'm4', 'm5']);

    const result = await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(result).toEqual({ count: 5 });
    expect(await unreadInbox(engine)).toEqual([]);
  });

  it('respects the account scope', async () => {
    const engine = createTestEngine();
    const first = await syncedAccount(engine, ['a1']);
    const second = await syncedAccount(engine, ['b1'], {
      email: 'bob@work.test',
      isPrimary: false,
    });

    const result = await engine.services.folderRead.markAllRead(USER_ID, {
      view: 'inbox',
      accountId: first.account.id,
    });

    expect(result).toEqual({ count: 1 });
    expect(await unreadInbox(engine)).toEqual([second.account.id]);
    expect(second.server.record('INBOX', 1).flags.seen).toBe(false);
  });

  it('marks a mailbox folder', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Projekty', 'custom');
    deliverUnread(seeded, 'Projekty', ['f1', 'f2']);
    deliverUnread(seeded, 'INBOX', ['i1']);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const folder = present(
      await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Projekty'),
    );

    const result = await engine.services.folderRead.markAllRead(USER_ID, {
      view: 'mailbox',
      mailboxId: folder.id,
    });

    expect(result).toEqual({ count: 2 });
    expect(seeded.server.record('Projekty', 1).flags.seen).toBe(true);
    expect(await unreadInbox(engine)).toEqual([seeded.account.id]);
  });

  it('marks a label', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1', 'm2']);
    const label = await engine.repositories.labels.upsert({
      id: 'label_clients' as LabelId,
      accountId: seeded.account.id,
      name: 'Clients',
      color: null,
      kind: 'keyword',
      remoteName: 'Clients',
    });
    const [labelled] = (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 }))
      .items;
    await engine.services.actions.apply(USER_ID, present(labelled).id, {
      type: 'addLabel',
      labelId: label.id,
    });

    const result = await engine.services.folderRead.markAllRead(USER_ID, {
      view: 'label',
      labelId: label.id,
    });

    expect(result).toEqual({ count: 1 });
    expect(await unreadInbox(engine)).toEqual([seeded.account.id]);
  });

  it('returns zero and touches nothing when all read', async () => {
    const engine = createTestEngine();
    const seeded = await syncedAccount(engine, ['m1', 'm2']);
    await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });
    engine.events.clear();
    seeded.server.failOperations = 'Server busy';

    const result = await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(result).toEqual({ count: 0 });
    expect(pendingOps(engine)).toEqual([]);
    expect(engine.events.ofType('thread.upserted')).toEqual([]);
  });

  it('keeps local seen when the provider mirror fails', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedAccount(
      engine,
      ['m1', 'm2', 'm3'],
      {},
      {
        condstore: false,
      },
    );
    server.failOperations = 'Server busy';

    const result = await engine.services.folderRead.markAllRead(USER_ID, { view: 'inbox' });

    expect(result).toEqual({ count: 3 });
    expect(await unreadInbox(engine)).toEqual([]);
    expect(server.record('INBOX', 1).flags.seen).toBe(false);
    expect(pendingOps(engine)).toHaveLength(3);

    server.failOperations = null;
    server.failFlagWrites = 'STORE rejected';
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await unreadInbox(engine)).toEqual([]);
    expect(pendingOps(engine)).toHaveLength(3);

    server.failFlagWrites = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await unreadInbox(engine)).toEqual([]);
    expect([1, 2, 3].map((uid) => server.record('INBOX', uid).flags.seen)).toEqual([
      true,
      true,
      true,
    ]);
    expect(pendingOps(engine)).toEqual([]);
  });
});

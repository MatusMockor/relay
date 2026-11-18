import type { AccountId, Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const syncedThread = async (engine: TestEngine, keywords: readonly string[] = []) => {
  const seeded = await seedAccount(engine);
  deliverMail(seeded.server, 'INBOX', { id: 'k1', date: DATE, keywords });
  deliverMail(seeded.server, 'Archive', { id: 'k2', inReplyTo: 'k1', date: DATE, keywords });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  engine.events.clear();
  return { ...seeded, thread: present(page.items[0]) };
};

const labelsOf = (engine: TestEngine, accountId: AccountId) =>
  engine.repositories.labels.list(USER_ID, accountId);

const pending = (engine: TestEngine, kind: string) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === kind);

const lastLabels = (engine: TestEngine): readonly Label[] =>
  engine.events.ofType('labels.updated').at(-1)?.data.labels ?? [];

describe('LabelService for keyword labels', () => {
  it('creates a local label without contacting the server and writes it as a keyword', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine);

    const label = await engine.services.labelAdmin.create(USER_ID, {
      accountId: account.id,
      name: '  Faktúry  ',
    });

    expect(label).toMatchObject({ name: 'Faktúry', remoteName: 'Faktúry', kind: 'keyword' });
    expect(label.color).toBeNull();
    expect(server.createdMailboxes).toEqual([]);
    expect(lastLabels(engine).map((item) => item.name)).toEqual(['Faktúry']);

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });
    expect(server.record('INBOX', 1).keywords).toEqual(['Faktúry']);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await labelsOf(engine, account.id)).map((item) => item.id)).toEqual([label.id]);
  });

  it('rejects names that are empty, too long or already used ignoring case', async () => {
    const engine = createTestEngine();
    const { account } = await syncedThread(engine, ['Klienti']);
    const create = (name: string) =>
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name });

    await expect(create('   ')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('x'.repeat(101))).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('KLIENTI')).rejects.toMatchObject({
      code: 'conflict',
      message: 'Štítok s týmto názvom už existuje.',
    });
  });

  it('renames only the display name and changes the colour locally', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);

    const renamed = await engine.services.labelAdmin.update(USER_ID, label.id, {
      name: 'Klienti s.r.o.',
      color: '#ff8800',
    });

    expect(renamed).toMatchObject({
      id: label.id,
      name: 'Klienti s.r.o.',
      remoteName: 'clients',
      color: '#ff8800',
    });
    expect(server.record('INBOX', 1).keywords).toEqual(['clients']);
    expect(lastLabels(engine)).toEqual([renamed]);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await labelsOf(engine, account.id)).toEqual([renamed]);
  });

  it('deletes the label, refreshes its threads and purges the keyword everywhere', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, ['clients', 'kept']);
    const [clients] = (await labelsOf(engine, account.id)).filter((l) => l.name === 'clients');
    const label = present(clients);

    await engine.services.labelAdmin.remove(USER_ID, label.id);

    expect(server.keywordPurges.map(({ path }) => path).sort()).toEqual([
      'Archive',
      'INBOX',
      'Sent',
      'Trash',
    ]);
    expect(server.record('INBOX', 1).keywords).toEqual(['kept']);
    expect(server.record('Archive', 1).keywords).toEqual(['kept']);
    expect(pending(engine, 'keyword-purge')).toEqual([]);
    const upserted = engine.events.ofType('thread.upserted').map((e) => e.data.thread);
    expect(upserted.map((item) => item.id)).toEqual([thread.id]);
    expect(upserted[0]?.labelIds).not.toContain(label.id);
    expect(lastLabels(engine).map((item) => item.name)).toEqual(['kept']);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await labelsOf(engine, account.id)).map((item) => item.name)).toEqual(['kept']);
  });

  it('keeps the purge queued while offline and runs it on the next sync', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);
    server.failOperations = 'connection reset';

    await engine.services.labelAdmin.remove(USER_ID, label.id);

    expect(await labelsOf(engine, account.id)).toEqual([]);
    expect(pending(engine, 'keyword-purge')).toHaveLength(1);

    server.failOperations = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(pending(engine, 'keyword-purge')).toEqual([]);
    expect(server.record('INBOX', 1).keywords).toEqual([]);
    expect(await labelsOf(engine, account.id)).toEqual([]);
  });

  it('does not bring the label back from keywords still waiting to be purged', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);
    server.failKeywordPurge = 'STORE rejected';
    await engine.services.labelAdmin.remove(USER_ID, label.id);
    server.updateKeywords('INBOX', 1, ['clients', 'fresh']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await labelsOf(engine, account.id)).map((item) => item.name)).toEqual(['fresh']);
    expect(pending(engine, 'keyword-purge')).toHaveLength(1);

    server.failKeywordPurge = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(pending(engine, 'keyword-purge')).toEqual([]);
    expect(server.record('INBOX', 1).keywords).toEqual(['fresh']);
  });

  it('cancels a queued purge when a label with the same keyword is created again', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);
    server.failOperations = 'connection reset';
    await engine.services.labelAdmin.remove(USER_ID, label.id);

    await engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name: 'clients' });

    expect(pending(engine, 'keyword-purge')).toEqual([]);
  });

  it('adopts a new server keyword whose name is taken by a renamed label', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);
    await engine.services.labelAdmin.update(USER_ID, label.id, { name: 'VIP' });
    server.updateKeywords('INBOX', 1, ['clients', 'VIP']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const synced = await labelsOf(engine, account.id);
    expect(synced.map(({ name, remoteName }) => [name, remoteName])).toEqual([
      ['VIP', 'clients'],
      ['VIP (2)', 'VIP'],
    ]);
  });

  it('reports a missing label', async () => {
    const engine = createTestEngine();
    await syncedThread(engine);

    await expect(
      engine.services.labelAdmin.remove(USER_ID, 'label_missing' as Label['id']),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

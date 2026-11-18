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

const namesOf = async (engine: TestEngine, accountId: AccountId) =>
  (await labelsOf(engine, accountId)).map(({ name, remoteName }) => [name, remoteName]);

const lastLabels = (engine: TestEngine): readonly Label[] =>
  engine.events.ofType('labels.updated').at(-1)?.data.labels ?? [];

describe('LabelService for keyword labels', () => {
  it('creates a local label and writes it as an encoded keyword identity', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine);

    const label = await engine.services.labelAdmin.create(USER_ID, {
      accountId: account.id,
      name: '  Faktúry  ',
    });

    expect(label).toMatchObject({ name: 'Faktúry', remoteName: 'Fakt&c3ba-ry', kind: 'keyword' });
    expect(label.color).toBeNull();
    expect(server.createdMailboxes).toEqual([]);
    expect(lastLabels(engine).map((item) => item.name)).toEqual(['Faktúry']);

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });
    expect(server.record('INBOX', 1).keywords).toEqual(['Fakt&c3ba-ry']);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await labelsOf(engine, account.id)).toEqual([label]);
  });

  it('rejects names that are empty, too long, reserved or already used ignoring case', async () => {
    const engine = createTestEngine();
    const { account } = await syncedThread(engine, ['Klienti']);
    const create = (name: string) =>
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name });
    const reserved = { code: 'validation_failed', message: 'Tento názov je vyhradený serverom.' };

    await expect(create('   ')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('x'.repeat(101))).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('a\u0001b')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('$Work')).rejects.toMatchObject(reserved);
    await expect(create('Junk')).rejects.toMatchObject(reserved);
    await expect(create('NonJunk')).rejects.toMatchObject(reserved);
    await expect(create('KLIENTI')).rejects.toMatchObject({
      code: 'conflict',
      message: 'Štítok s týmto názvom už existuje.',
    });
  });

  it('rejects new keyword labels whose encoded keyword is too long for the server', async () => {
    const engine = createTestEngine();
    const { account } = await syncedThread(engine, ['clients']);
    const create = (name: string) =>
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name });
    const tooLong = {
      code: 'validation_failed',
      message: 'Názov štítka je pre server príliš dlhý.',
    };

    await expect(create('日'.repeat(100))).rejects.toMatchObject(tooLong);
    await expect(create('a'.repeat(51))).rejects.toMatchObject(tooLong);
    await expect(create('a'.repeat(50))).resolves.toMatchObject({ remoteName: 'a'.repeat(50) });
    const label = present((await labelsOf(engine, account.id)).find((l) => l.name === 'clients'));
    await expect(
      engine.services.labelAdmin.update(USER_ID, label.id, { name: '日'.repeat(100) }),
    ).resolves.toMatchObject({ remoteName: 'clients' });
  });

  it('keeps a label named like a system flag across syncs because it is encoded', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine);
    const label = await engine.services.labelAdmin.create(USER_ID, {
      accountId: account.id,
      name: '\\Pseudo',
    });

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('INBOX', 1).keywords).toEqual(['&5c-Pseudo']);
    expect(server.record('Archive', 1).keywords).toEqual(['&5c-Pseudo']);
    const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(messages.map((message) => message.labelIds)).toEqual([[label.id], [label.id]]);
  });

  it('lets only one of two concurrent creates or renames with the same name win', async () => {
    const engine = createTestEngine();
    const { account } = await syncedThread(engine, ['alpha', 'beta']);
    const create = (name: string) =>
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name });

    const created = await Promise.allSettled([create('Test'), create('TEST')]);
    const [alpha, beta] = await labelsOf(engine, account.id);
    const renamed = await Promise.allSettled([
      engine.services.labelAdmin.update(USER_ID, present(alpha).id, { name: 'Spolu' }),
      engine.services.labelAdmin.update(USER_ID, present(beta).id, { name: 'SPOLU' }),
    ]);

    for (const results of [created, renamed]) {
      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.reason).toMatchObject({ code: 'conflict' });
    }
  });

  it('renames only the display name and changes the colour locally', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);

    const renamed = await engine.services.labelAdmin.update(USER_ID, label.id, {
      name: 'Klienti s.r.o.',
      color: '#ff8800',
    });

    expect(renamed).toMatchObject({ name: 'Klienti s.r.o.', remoteName: 'clients' });
    expect(renamed.color).toBe('#ff8800');
    expect(server.record('INBOX', 1).keywords).toEqual(['clients']);
    expect(lastLabels(engine)).toEqual([renamed]);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await labelsOf(engine, account.id)).toEqual([renamed]);
  });

  it('keeps the exact server keyword of foreign labels and writes it back unchanged', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, ['A&B-C', 'Fakt&c3ba-ry']);
    expect(await namesOf(engine, account.id)).toEqual([
      ['A&B-C', 'A&B-C'],
      ['Faktúry', 'Fakt&c3ba-ry'],
    ]);
    const [foreign] = await labelsOf(engine, account.id);

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'removeLabel',
      labelId: present(foreign).id,
    });

    expect(server.record('INBOX', 1).keywords).toEqual(['Fakt&c3ba-ry']);
  });

  it('treats keywords that differ only in case as one label', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['Clients']);
    server.updateKeywords('Archive', 1, ['CLIENTS']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const labels = await labelsOf(engine, account.id);
    expect(labels.map(({ name }) => name)).toEqual(['Clients']);
    const messages = [...engine.db.tables.messages.values()];
    expect(messages.map((message) => message.labelIds)).toEqual([
      [present(labels[0]).id],
      [present(labels[0]).id],
    ]);
    await expect(
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name: 'cLiEnTs' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('adopts a new server keyword whose name is taken by a renamed label', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = present((await labelsOf(engine, account.id))[0]);
    await engine.services.labelAdmin.update(USER_ID, label.id, { name: 'VIP' });
    server.updateKeywords('INBOX', 1, ['clients', 'vip']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await namesOf(engine, account.id)).toEqual([
      ['VIP', 'clients'],
      ['vip (2)', 'vip'],
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

import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};
const TAGGED: MailSpec = {
  id: 'g1',
  labels: ['\\Inbox', 'Projekty', 'Projekty/Alfa'],
  emailId: 'gm-1',
  date: DATE,
};

const PLAIN: MailSpec = { id: 'g9', labels: ['\\Inbox'], emailId: 'gm-9', date: DATE };

const gmailAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });
  seeded.server.addMailbox('Projekty', 'label', 501);
  seeded.server.addMailbox('Projekty/Alfa', 'label', 502);
  deliverMail(seeded.server, 'INBOX', TAGGED);
  deliverMail(seeded.server, 'Archive', TAGGED);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  engine.events.clear();
  return seeded;
};

const labelsOf = async (engine: TestEngine, accountId: AccountId) =>
  (await engine.repositories.labels.list(USER_ID, accountId)).map(({ id, name, remoteName }) => ({
    id,
    name,
    remoteName,
  }));

const findLabel = async (engine: TestEngine, accountId: AccountId, path: string) =>
  present(await engine.repositories.labels.findByRemoteName(accountId, 'gmail', path));

describe('LabelService for Gmail labels', () => {
  it('creates the label on Gmail and stores its mailbox and label', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);

    const label = await engine.services.labelAdmin.create(USER_ID, {
      accountId: account.id,
      name: 'Faktúry',
      color: '#22aa66',
    });

    expect(server.createdMailboxes).toEqual(['Faktúry']);
    expect(label).toMatchObject({ kind: 'gmail', name: 'Faktúry', remoteName: 'Faktúry' });
    const mailbox = await engine.repositories.mailboxes.findByPath(account.id, 'Faktúry');
    expect(mailbox?.role).toBe('label');
    expect(engine.events.ofType('mailboxes.updated')).toHaveLength(1);
    expect(engine.events.ofType('labels.updated')).toHaveLength(1);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await findLabel(engine, account.id, 'Faktúry')).toEqual(label);
  });

  it('rejects names Gmail reserves', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const create = (name: string) =>
      engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name });

    await expect(create('[Gmail]/Mine')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('a\\b')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(create('projekty')).rejects.toMatchObject({ code: 'conflict' });
    expect(server.createdMailboxes).toEqual([]);
  });

  it('renames the label and its nested labels on Gmail, keeping their ids', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const parent = await findLabel(engine, account.id, 'Projekty');
    const child = await findLabel(engine, account.id, 'Projekty/Alfa');

    const renamed = await engine.services.labelAdmin.update(USER_ID, parent.id, { name: 'Práca' });

    expect(server.renamedMailboxes).toEqual([{ path: 'Projekty', newPath: 'Práca' }]);
    expect(renamed).toMatchObject({ id: parent.id, name: 'Práca', remoteName: 'Práca' });
    const expected = [
      { id: parent.id, name: 'Práca', remoteName: 'Práca' },
      { id: child.id, name: 'Práca/Alfa', remoteName: 'Práca/Alfa' },
    ];
    expect(await labelsOf(engine, account.id)).toEqual(expected);
    expect(await engine.repositories.mailboxes.findByPath(account.id, 'Práca/Alfa')).not.toBeNull();

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await labelsOf(engine, account.id)).toEqual(expected);
    const messages = [...engine.db.tables.messages.values()];
    expect(messages.map((message) => [...message.labelIds].sort())).toEqual([
      [parent.id, child.id].sort(),
      [parent.id, child.id].sort(),
    ]);
  });

  it('retargets label writes queued for the renamed tree', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'INBOX', PLAIN);
    deliverMail(server, 'Archive', PLAIN);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const child = await findLabel(engine, account.id, 'Projekty/Alfa');
    const parent = await findLabel(engine, account.id, 'Projekty');
    const plain = present(
      [...engine.db.tables.threads.values()].find((thread) => thread.subject === 'Subject g9'),
    );
    server.failOperations = 'connection reset';
    await engine.services.actions.apply(USER_ID, plain.id, {
      type: 'addLabel',
      labelId: child.id,
    });
    server.failOperations = null;

    await engine.services.labelAdmin.update(USER_ID, parent.id, { name: 'Práca' });

    const queued = await engine.repositories.pendingWork.list(account.id, 'provider-op');
    expect(queued.map((work) => work.payload.change)).toEqual([
      { kind: 'label', label: 'Práca/Alfa', value: true },
    ]);
    expect(queued.map((work) => work.ref.endsWith(':label:Práca/Alfa'))).toEqual([true]);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.labelWrites.at(-1)).toMatchObject({ add: ['Práca/Alfa'] });
    const messages = await engine.repositories.messages.listByThread(USER_ID, plain.id);
    expect(messages.map((message) => message.labelIds)).toEqual([[child.id], [child.id]]);
  });

  it('deletes the label on Gmail, keeps the mail and clears it from local threads', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const child = await findLabel(engine, account.id, 'Projekty/Alfa');

    await engine.services.labelAdmin.remove(USER_ID, child.id);

    expect(server.deletedMailboxes).toEqual(['Projekty/Alfa']);
    expect(server.mailbox('Archive').messages.size).toBe(1);
    expect((await labelsOf(engine, account.id)).map(({ name }) => name)).toEqual(['Projekty']);
    expect(await engine.repositories.mailboxes.findByPath(account.id, 'Projekty/Alfa')).toBeNull();
    const thread = engine.events.ofType('thread.upserted').at(-1)?.data.thread;
    expect(thread?.labelIds).not.toContain(child.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await labelsOf(engine, account.id)).map(({ name }) => name)).toEqual(['Projekty']);
  });

  it('keeps the label when Gmail refuses to delete it', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const child = await findLabel(engine, account.id, 'Projekty/Alfa');
    server.failOperations = 'connection reset';

    await expect(engine.services.labelAdmin.remove(USER_ID, child.id)).rejects.toThrow();

    expect((await labelsOf(engine, account.id)).map(({ name }) => name)).toEqual([
      'Projekty',
      'Projekty/Alfa',
    ]);
  });
});

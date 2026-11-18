import type { Label, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { renameFakeMailbox } from '../support/mail/fake-folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const gmailAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });
  seeded.server.addMailbox('[Gmail]/Starred', 'system');
  seeded.server.addMailbox('Klienti', 'label', 501);
  seeded.server.addMailbox('Klienti/Acme', 'label', 502);
  return seeded;
};

const labelled = { id: 'g1', labels: ['\\Inbox', '\\Important', 'Klienti/Acme'], emailId: 'gm-1' };

const gmailLabels = (engine: TestEngine): Promise<Label[]> =>
  engine.repositories.labels.list(USER_ID, null);

const labelView = async (engine: TestEngine, label: Label): Promise<ThreadId[]> =>
  (
    await engine.services.inbox.list(USER_ID, { view: 'label', labelId: label.id, limit: 20 })
  ).items.map((item) => item.id);

const labelNamed = async (engine: TestEngine, name: string): Promise<Label> =>
  present((await gmailLabels(engine)).find((label) => label.name === name));

describe('Gmail labels', () => {
  it('turns label mailboxes into Gmail labels and never syncs them', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'INBOX', { ...labelled, date: DATE });
    deliverMail(server, 'Archive', { ...labelled, date: DATE });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const labels = await gmailLabels(engine);
    expect(labels.map(({ name, kind, remoteName }) => ({ name, kind, remoteName }))).toEqual([
      { name: 'Klienti', kind: 'gmail', remoteName: 'Klienti' },
      { name: 'Klienti/Acme', kind: 'gmail', remoteName: 'Klienti/Acme' },
    ]);
    const acme = await labelNamed(engine, 'Klienti/Acme');
    const threads = [...engine.db.tables.threads.values()];
    expect(threads).toHaveLength(1);
    expect(present(threads[0]).labelIds).toEqual([acme.id]);
    expect([...engine.db.tables.messages.values()].map((message) => message.emailId)).toEqual([
      'gm-1',
      'gm-1',
    ]);
    const synced = server.uidListings.concat(server.streamedMessages.map(({ path }) => path));
    expect(
      synced.filter((path) => path.startsWith('Klienti') || path.startsWith('[Gmail]')),
    ).toEqual([]);
    expect(engine.events.ofType('labels.updated')).toHaveLength(1);
  });

  it('shows archived mail in the label view, not only the inbox', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'Archive', { ...labelled, labels: ['Klienti'], date: DATE });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const thread = present([...engine.db.tables.threads.values()][0]);
    expect(thread.state).toBe('done');
    expect(await labelView(engine, await labelNamed(engine, 'Klienti'))).toEqual([thread.id]);
  });

  it('rescans synced mail when a new label appears and drops removed labels', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const uid = deliverMail(server, 'Archive', { ...labelled, labels: [], date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    server.addMailbox('Faktúry', 'label', 503);
    server.record('Archive', uid).labels = ['Faktúry'];
    server.removeMailbox('Klienti/Acme');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const faktury = await labelNamed(engine, 'Faktúry');
    expect((await gmailLabels(engine)).map((label) => label.name).sort()).toEqual([
      'Faktúry',
      'Klienti',
    ]);
    expect(present([...engine.db.tables.threads.values()][0]).labelIds).toEqual([faktury.id]);
    expect(server.flagScans.find(({ path }) => path === 'Archive')?.uids).toEqual([uid]);
  });

  it('keeps the label id when a label is renamed in Gmail', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'INBOX', { ...labelled, date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const acme = await labelNamed(engine, 'Klienti/Acme');

    renameFakeMailbox(server, 'Klienti/Acme', 'Klienti/Acme s.r.o.');
    server.mailbox('INBOX').messages.forEach((record) => {
      record.labels = ['Klienti/Acme s.r.o.'];
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const renamed = await labelNamed(engine, 'Klienti/Acme s.r.o.');
    expect(renamed.id).toBe(acme.id);
    expect(renamed.remoteName).toBe('Klienti/Acme s.r.o.');
  });

  it('ignores IMAP keywords on Gmail and filters spam keywords on plain IMAP', async () => {
    const engine = createTestEngine();
    const gmail = await gmailAccount(engine);
    deliverMail(gmail.server, 'INBOX', { ...labelled, keywords: ['Projekt'], date: DATE });
    await engine.services.sync.syncAccount(USER_ID, gmail.account.id);
    const plain = await seedAccount(engine, { email: 'bob@example.com' });
    deliverMail(plain.server, 'INBOX', {
      id: 'p1',
      keywords: ['Junk', 'NonJunk', 'NotJunk', '$Forwarded', 'Projekt'],
      date: DATE,
    });
    await engine.services.sync.syncAccount(USER_ID, plain.account.id);

    const labels = await gmailLabels(engine);
    expect(labels.filter((label) => label.kind === 'keyword').map((label) => label.name)).toEqual([
      'Projekt',
    ]);
    expect(labels.find((label) => label.kind === 'keyword')?.accountId).toBe(plain.account.id);
  });
});

import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { renameFakeMailbox } from '../support/mail/fake-folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const SELECTED = ['INBOX', 'Sent', 'Archive', 'Trash'];
const LABELS = ['Klienti', 'Klienti/Acme', 'Projekty'];

const gmailAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });
  LABELS.forEach((path, index) => seeded.server.addMailbox(path, 'label', 600 + index));
  return seeded;
};

const mailboxAt = async (engine: TestEngine, accountId: AccountId, path: string) =>
  present(await engine.repositories.mailboxes.findByPath(accountId, path));

describe('deferred mailbox status probe', () => {
  it('reads the status of label mailboxes only after the selected mailboxes are synced', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'Klienti', { id: 'k1' });
    deliverMail(server, 'INBOX', { id: 'i1' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.statusCalls.filter((path) => SELECTED.includes(path))).toEqual(SELECTED);
    const firstLabel = server.statusCalls.findIndex((path) => LABELS.includes(path));
    expect(server.statusCalls.slice(0, firstLabel)).toEqual(SELECTED);
    expect(server.statusCalls.slice(firstLabel)).toEqual(LABELS);
    expect(await mailboxAt(engine, account.id, 'Klienti')).toMatchObject({
      uidValidity: 600,
      totalCount: 1,
      unreadCount: 1,
    });
  });

  it('does not probe validated label mailboxes again', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.statusCalls.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.statusCalls.filter((path) => LABELS.includes(path))).toEqual([]);
  });

  it('still detects a renamed label by its UIDVALIDITY', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const before = await mailboxAt(engine, account.id, 'Projekty');
    renameFakeMailbox(server, 'Projekty', 'Projekty 2026');
    server.statusCalls.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.statusCalls.filter((path) => !SELECTED.includes(path))).toEqual([
      'Projekty 2026',
    ]);
    expect(await mailboxAt(engine, account.id, 'Projekty 2026')).toMatchObject({ id: before.id });
  });
});

import type { AccountId, MailboxRole } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const kept = (index: number): MailSpec => ({
  id: `k${String(index)}`,
  subject: `Plan ${String(index)}`,
  labels: ['\\Inbox'],
  emailId: `gm-k${String(index)}`,
  date: `2026-11-1${String(index)}T08:00:00.000Z`,
});

const placementUids = async (
  engine: TestEngine,
  accountId: AccountId,
  role: MailboxRole,
): Promise<number[]> => {
  const mailbox = present(await engine.repositories.mailboxes.findByRole(accountId, role));
  return [...engine.db.tables.messages.values()]
    .flatMap((message) => message.placements)
    .filter((placement) => placement.mailboxId === mailbox.id)
    .map((placement) => placement.uid)
    .sort((left, right) => left - right);
};

const archiveWindow = async (engine: TestEngine, accountId: AccountId) => {
  const mailbox = present(await engine.repositories.mailboxes.findByRole(accountId, 'archive'));
  return (await engine.repositories.syncStates.find(mailbox.id))?.initialWindow;
};

const afterArchiveWindow = (server: FakeMailServer, change: () => void): void => {
  server.onThreadHeaders = (path) => {
    if (path !== 'Archive') {
      return;
    }
    server.onThreadHeaders = null;
    change();
  };
};

describe('initial Gmail sync metadata attach revalidation', () => {
  it('does not attach a placement for a copy expunged after its window was read', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', kept(1));
    afterArchiveWindow(server, () => {
      server.expunge('Archive', 1);
    });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(true);
    expect(await placementUids(engine, account.id, 'inbox')).toEqual([1]);
    expect(await placementUids(engine, account.id, 'archive')).toEqual([]);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('skips the mailbox when its UIDVALIDITY changes after its window was read', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', kept(1));
    afterArchiveWindow(server, () => {
      server.resetUidValidity('Archive');
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placementUids(engine, account.id, 'inbox')).toEqual([1]);
    expect(await placementUids(engine, account.id, 'archive')).toEqual([]);
    expect(await archiveWindow(engine, account.id)).not.toBeNull();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placementUids(engine, account.id, 'archive')).toEqual([1]);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('reads the headers of a fresh account without copies only once', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', { ...kept(1), allMail: false });
    const reads: string[] = [];
    server.onThreadHeaders = (path) => {
      reads.push(path);
    };

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placementUids(engine, account.id, 'inbox')).toEqual([1]);
    expect(reads.filter((path) => path === 'INBOX')).toHaveLength(1);
  });

  it('revalidates the copies of one chunk with a single header fetch per mailbox', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    [1, 2, 3].forEach((index) => deliverMail(server, 'INBOX', kept(index)));
    const archiveReads: string[] = [];
    server.onThreadHeaders = (path) => {
      archiveReads.push(path);
    };

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placementUids(engine, account.id, 'archive')).toEqual([1, 2, 3]);
    expect(archiveReads.filter((path) => path === 'Archive')).toHaveLength(2);
    expect(server.streamedMessages.filter((entry) => entry.path === 'Archive')).toEqual([]);
  });
});

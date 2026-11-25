import type { AccountId, MailboxRole } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const KEPT: MailSpec = {
  id: 'k1',
  subject: 'Plan',
  labels: ['\\Inbox'],
  emailId: 'gm-k1',
  date: '2026-11-14T08:00:00.000Z',
};

const placedIn = async (
  engine: TestEngine,
  accountId: AccountId,
  role: MailboxRole,
): Promise<number> => {
  const mailbox = present(await engine.repositories.mailboxes.findByRole(accountId, role));
  return [...engine.db.tables.messages.values()]
    .flatMap((message) => message.placements)
    .filter((placement) => placement.mailboxId === mailbox.id).length;
};

const heldWindow = async (engine: TestEngine, accountId: AccountId, role: MailboxRole) => {
  const mailbox = present(await engine.repositories.mailboxes.findByRole(accountId, role));
  return (await engine.repositories.syncStates.find(mailbox.id))?.initialWindow;
};

const keptAccount = async (engine: TestEngine, heldPath: string) => {
  const seeded = await seedGmailAccount(engine);
  seeded.server.addMailbox('Spam', 'spam');
  deliverMail(seeded.server, 'INBOX', KEPT);
  deliverMail(seeded.server, 'Archive', KEPT);
  deliverMail(seeded.server, heldPath, KEPT);
  return seeded;
};

describe('initial Gmail sync of held copies of already stored mail', () => {
  it.each([
    ['Trash', 'trash'],
    ['Spam', 'spam'],
  ] as const)('does not attach the %s copy while its relative lookup fails', async (path, role) => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await keptAccount(engine, path);
    server.failSearchIn = 'Sent';

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(true);
    expect(await placedIn(engine, account.id, 'inbox')).toBe(1);
    expect(await placedIn(engine, account.id, role)).toBe(0);
    const window = await heldWindow(engine, account.id, role);
    expect(window).toBeDefined();
    expect(window).not.toBeNull();

    server.failSearchIn = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placedIn(engine, account.id, role)).toBe(1);
    expect(engine.db.tables.messages.size).toBe(1);
    expect(await heldWindow(engine, account.id, role)).toBeNull();
  });

  it.each([
    ['Trash', 'trash'],
    ['Spam', 'spam'],
  ] as const)('attaches the %s copy once its relatives resolve', async (path, role) => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await keptAccount(engine, path);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await placedIn(engine, account.id, 'inbox')).toBe(1);
    expect(await placedIn(engine, account.id, role)).toBe(1);
    expect(engine.db.tables.messages.size).toBe(1);
    expect(await heldWindow(engine, account.id, role)).toBeNull();
    expect(server.streamedMessages.filter((entry) => entry.path === path)).toEqual([]);
  });
});

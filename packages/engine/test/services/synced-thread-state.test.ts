import { type MailboxRole, type Message, primaryPlacement } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { MailCopies } from '../../src/services/shared/mail-copies';
import { roleMapLookup } from '../../src/services/shared/mailbox-role-of';
import { PendingMoves } from '../../src/services/shared/pending-moves';
import { recordProviderOps } from '../../src/services/shared/provider-ops';
import { placementRolesOf, syncedThreadState } from '../../src/services/sync/synced-thread-state';
import { emptyThreadWork } from '../../src/services/sync/thread-refresh-work';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const trashedThread = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'Trash', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present(
    (await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 })).items[0],
  );
  const mailboxes = await engine.repositories.mailboxes.listForSync(account.id);
  const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
  const roleOf = roleMapLookup(roles);
  const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
  const queueMoves = async (moved: readonly Message[], role: MailboxRole) => {
    const ops = moved.map((message) => ({
      messageId: message.id,
      change: { kind: 'move' as const, role },
      source: primaryPlacement(message, roleOf),
    }));
    await recordProviderOps(engine.repositories.pendingWork, account.id, ops, TEST_NOW);
    return PendingMoves.load(engine.repositories.pendingWork, account.id);
  };
  return { thread, roles, messages, queueMoves, copies: MailCopies.of(account) };
};

describe('syncedThreadState', () => {
  it('honours a pending local restore over the stored trash location', async () => {
    const engine = createTestEngine();
    const { thread, roles, messages, queueMoves, copies } = await trashedThread(engine);
    const restoring = await queueMoves(messages, 'inbox');

    const state = syncedThreadState(
      emptyThreadWork(thread.id),
      { ...thread, state: 'inbox' },
      messages,
      placementRolesOf(roles, restoring),
      copies,
    );

    expect(state).toBe('inbox');
  });

  it('honours a pending local trash over the stored inbox location', async () => {
    const engine = createTestEngine();
    const { thread, roles, messages, queueMoves, copies } = await trashedThread(engine);
    const inboxId = present([...roles].find(([, role]) => role === 'inbox'))[0];
    const inInbox = messages.map((message) => ({
      ...message,
      mailboxId: inboxId,
      placements: [{ mailboxId: inboxId, uid: message.uid }],
    }));
    const trashing = await queueMoves(inInbox, 'trash');

    const state = syncedThreadState(
      { ...emptyThreadWork(thread.id), expungedFromInbox: true },
      thread,
      inInbox,
      placementRolesOf(roles, trashing),
      copies,
    );

    expect(state).toBe('trash');
  });
});

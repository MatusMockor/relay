import type { MailboxRole, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { messageRoleOf, syncedThreadState } from '../../src/services/sync/synced-thread-state';
import { emptyThreadWork } from '../../src/services/sync/thread-refresh-work';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const trashedThread = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'Trash', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present(
    (await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 })).items[0],
  );
  const mailboxes = await engine.repositories.mailboxes.listForSync(account.id);
  const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
  const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
  return { thread, roles, messages };
};

describe('syncedThreadState', () => {
  it('honours a pending local restore over the stored trash location', async () => {
    const engine = createTestEngine();
    const { thread, roles, messages } = await trashedThread(engine);
    const restoring = new Map<MessageId, MailboxRole>(
      messages.map((message) => [message.id, 'inbox']),
    );

    const roleOf = messageRoleOf(roles, restoring);
    const state = syncedThreadState(
      emptyThreadWork(thread.id),
      { ...thread, state: 'inbox' },
      messages,
      roleOf,
    );

    expect(state).toBe('inbox');
  });

  it('honours a pending local trash over the stored inbox location', async () => {
    const engine = createTestEngine();
    const { thread, roles, messages } = await trashedThread(engine);
    const inboxId = present([...roles].find(([, role]) => role === 'inbox'))[0];
    const inInbox = messages.map((message) => ({ ...message, mailboxId: inboxId }));
    const trashing = new Map<MessageId, MailboxRole>(
      messages.map((message) => [message.id, 'trash']),
    );

    const state = syncedThreadState(
      { ...emptyThreadWork(thread.id), expungedFromInbox: true },
      thread,
      inInbox,
      messageRoleOf(roles, trashing),
    );

    expect(state).toBe('trash');
  });
});

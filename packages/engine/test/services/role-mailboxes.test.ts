import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const inboxOnly = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  ['Sent', 'Archive', 'Trash'].forEach((path) => seeded.server.mailboxes.delete(path));
  deliverMail(seeded.server, 'INBOX', { id: 'm1', subject: 'Offer' });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return { ...seeded, thread: present(page.items[0]) };
};

describe('missing role mailboxes', () => {
  it('creates the archive mailbox on the first done and moves the message there', async () => {
    const engine = createTestEngine();
    const { server, account, thread } = await inboxOnly(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });

    expect(server.createdMailboxes).toEqual(['Archive']);
    expect([...server.mailbox('INBOX').messages.keys()]).toEqual([]);
    expect(server.mailbox('Archive').messages.size).toBe(1);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    expect(archive).toMatchObject({ path: 'Archive', name: 'Archive', role: 'archive' });
    const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(message?.mailboxId).toBe(archive.id);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'undone' });
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    expect(server.createdMailboxes).toEqual(['Archive']);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.db.tables.messages.size).toBe(1);
  });

  it('creates the trash mailbox on the first trash action', async () => {
    const engine = createTestEngine();
    const { server, thread } = await inboxOnly(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });

    expect(server.createdMailboxes).toEqual(['Trash']);
    expect(server.mailbox('Trash').messages.size).toBe(1);
  });

  it('creates the sent mailbox and appends the sent message', async () => {
    const engine = createTestEngine();
    const { server, account, thread } = await inboxOnly(engine);
    const [original] = await engine.repositories.messages.listByThread(USER_ID, thread.id);

    const response = await engine.services.compose.send(USER_ID, {
      source: 'inline',
      draft: {
        accountId: account.id,
        to: [{ name: null, email: 'peter@partner.test' }],
        cc: [],
        bcc: [],
        subject: 'Re: Offer',
        body: 'Sounds good',
        inReplyToThreadId: thread.id,
        inReplyToMessageId: present(original).id,
        attachments: [],
      },
    });

    expect(response).toMatchObject({ status: 'sent', threadId: thread.id });
    expect(server.createdMailboxes).toEqual(['Sent']);
    expect(server.mailbox('Sent').messages.size).toBe(1);
    const sent = present(await engine.repositories.mailboxes.findByRole(account.id, 'sent'));
    expect(sent.path).toBe('Sent');
  });

  it('reuses an existing mailbox with a localized name instead of creating one', async () => {
    const engine = createTestEngine();
    const { server, account, thread } = await inboxOnly(engine);
    server.addMailbox('Archív', 'archive');

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });

    expect(server.createdMailboxes).toEqual([]);
    expect(server.mailbox('Archív').messages.size).toBe(1);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    expect(archive.path).toBe('Archív');
  });

  it('creates a missing mailbox only once for concurrent actions', async () => {
    const engine = createTestEngine();
    const { server, account } = await inboxOnly(engine);
    deliverMail(server, 'INBOX', { id: 'm2', subject: 'Invoice' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(page.items).toHaveLength(2);

    await Promise.all(
      page.items.map((item) => engine.services.actions.apply(USER_ID, item.id, { type: 'done' })),
    );

    expect(server.createdMailboxes).toEqual(['Archive']);
    expect(server.mailbox('Archive').messages.size).toBe(2);
    const stored = await engine.repositories.mailboxes.listForSync(account.id);
    expect(stored.filter((mailbox) => mailbox.role === 'archive')).toHaveLength(1);
  });

  it('keeps a mailbox created while a sync was refreshing its mailbox list', async () => {
    const engine = createTestEngine();
    const { server, account, thread } = await inboxOnly(engine);
    server.afterNextList = async () => {
      await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    };

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.createdMailboxes).toEqual(['Archive']);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(messages.map((message) => message.mailboxId)).toEqual([archive.id]);
    const reloaded = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(reloaded?.state).toBe('done');
  });
});

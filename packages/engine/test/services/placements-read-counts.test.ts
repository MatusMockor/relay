import { ThreadListQuerySchema } from '@relay/shared/api';
import type { MailAccount, Message, ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { searchServer } from '../support/server-search';
import { answerAll } from '../support/thread-ai';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SELF_SENT: MailSpec = {
  id: 'self-1',
  subject: 'Poznámka pre seba',
  from: ME,
  to: [ME],
  date: '2026-11-14T08:00:00.000Z',
};

const sendToSelf = (server: FakeMailServer): void => {
  deliverMail(server, 'Sent', SELF_SENT);
  deliverMail(server, 'INBOX', SELF_SENT);
};

const stored = (engine: TestEngine): Message[] => [...engine.db.tables.messages.values()];

const inboxThread = async (engine: TestEngine): Promise<ThreadSummary> => {
  const page = await engine.services.inbox.list(
    USER_ID,
    ThreadListQuerySchema.parse({ view: 'inbox', q: 'Poznámka' }),
  );
  expect(page.items).toHaveLength(1);
  return present(page.items[0]);
};

const pathsOf = async (engine: TestEngine, account: MailAccount, message: Message) => {
  const mailboxes = await engine.repositories.mailboxes.listByAccount(USER_ID, account.id);
  const pathOf = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.path]));
  return message.placements.map((placement) => pathOf.get(placement.mailboxId)).sort();
};

const summarizedIds = async (engine: TestEngine, thread: ThreadSummary) => {
  answerAll(engine);
  const job = await engine.services.ai.createJob(USER_ID, {
    input: { kind: 'summary', threadId: thread.id },
  });
  await engine.services.ai.runJob(USER_ID, job.id);
  return engine.claude.requests[0]?.thread?.messages.map(({ id }) => id);
};

describe('thread reads over logical messages', () => {
  it('shows a Gmail mail sent to oneself once in counts, detail, search and AI', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    sendToSelf(server);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const [message, ...others] = stored(engine);
    expect(others).toEqual([]);
    const only = present(message);
    expect(await pathsOf(engine, account, only)).toEqual(['Archive', 'INBOX', 'Sent']);
    const thread = await inboxThread(engine);
    expect(thread.messageCount).toBe(1);
    const detail = await engine.services.threads.getDetail(USER_ID, thread.id);
    expect(detail.messages.map(({ id }) => id)).toEqual([only.id]);
    const response = await searchServer(engine, 'Poznámka');
    expect(response.hits.map((hit) => hit.messageId)).toEqual([only.id]);
    expect(await summarizedIds(engine, thread)).toEqual([only.id]);
  });

  it('counts and shows both copies of a plain IMAP mail sent to oneself', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    sendToSelf(server);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const copies = stored(engine);
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((copy) => copy.messageIdHeader)).size).toBe(1);
    const thread = await inboxThread(engine);
    expect(thread.messageCount).toBe(2);
    expect(thread.participants).toEqual([ME]);
    const detail = await engine.services.threads.getDetail(USER_ID, thread.id);
    expect(detail.messages.map(({ id }) => id).sort()).toEqual(copies.map(({ id }) => id).sort());
  });
});

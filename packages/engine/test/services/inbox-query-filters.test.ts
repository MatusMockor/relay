import { ThreadListQuerySchema } from '@relay/shared/api';
import { AttachmentIdSchema, type ThreadSummary } from '@relay/shared/domain';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const JANA = { name: 'Jana Novakova', email: 'jana@client.test' };

const subjectsOf = async (engine: TestEngine, raw: Record<string, string>): Promise<string[]> =>
  (
    await engine.services.inbox.list(
      USER_ID,
      ThreadListQuerySchema.parse({ view: 'inbox', ...raw }),
    )
  ).items.map((thread) => thread.subject);

const threadBySubject = async (engine: TestEngine, subject: string): Promise<ThreadSummary> => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  const thread = page.items.find((item) => item.subject === subject);
  assert(thread !== undefined, `missing thread ${subject}`);
  return thread;
};

const attachFile = async (engine: TestEngine, thread: ThreadSummary): Promise<void> => {
  const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
  assert(message !== undefined, 'missing message');
  await engine.repositories.messages.upsert(
    {
      ...message,
      attachments: [
        {
          id: AttachmentIdSchema.parse('att-contract'),
          filename: 'zmluva.pdf',
          contentType: 'application/pdf',
          size: 4096,
          contentId: null,
          inline: false,
        },
      ],
    },
    new Map(),
  );
};

describe('InboxQueryService search filters', () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverMail(seeded.server, 'INBOX', {
      id: 'invoice',
      subject: 'Invoice October',
      from: JANA,
      body: 'Please pay the invoice.',
      date: '2026-11-15T08:00:00.000Z',
    });
    deliverMail(seeded.server, 'INBOX', {
      id: 'meeting',
      subject: 'Meeting Friday',
      body: 'Jana sends the invoice tomorrow.',
      seen: true,
      date: '2026-11-15T09:00:00.000Z',
    });
    deliverMail(seeded.server, 'INBOX', {
      id: 'contract',
      subject: 'Contract draft',
      body: 'Signed copy attached.',
      seen: true,
      date: '2026-11-15T10:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  });

  it('parses the query string filters and passes them to the repository', async () => {
    await expect(subjectsOf(engine, { q: 'jana' })).resolves.toEqual([
      'Meeting Friday',
      'Invoice October',
    ]);
    await expect(subjectsOf(engine, { q: 'jana', searchField: 'from' })).resolves.toEqual([
      'Invoice October',
    ]);
    await expect(subjectsOf(engine, { q: 'invoice', searchField: 'subject' })).resolves.toEqual([
      'Invoice October',
    ]);
    await expect(subjectsOf(engine, { unread: 'true' })).resolves.toEqual(['Invoice October']);
    await expect(subjectsOf(engine, { unread: 'false' })).resolves.toHaveLength(3);
  });

  it('keeps threads with a file attachment', async () => {
    await attachFile(engine, await threadBySubject(engine, 'Contract draft'));

    await expect(subjectsOf(engine, { hasAttachment: 'true' })).resolves.toEqual([
      'Contract draft',
    ]);
    await expect(subjectsOf(engine, { hasAttachment: 'true', q: 'invoice' })).resolves.toEqual([]);
  });

  it('searches every folder except trash and spam', async () => {
    const invoice = await threadBySubject(engine, 'Invoice October');
    const contract = await threadBySubject(engine, 'Contract draft');
    await engine.repositories.threads.updateState(USER_ID, invoice.id, {
      state: 'trash',
      remindAt: null,
    });
    await engine.repositories.threads.updateState(USER_ID, contract.id, {
      state: 'done',
      remindAt: null,
    });

    await expect(subjectsOf(engine, { q: 'contract' })).resolves.toEqual([]);
    await expect(subjectsOf(engine, { q: 'contract', everywhere: 'true' })).resolves.toEqual([
      'Contract draft',
    ]);
    await expect(subjectsOf(engine, { q: 'invoice', everywhere: 'true' })).resolves.toEqual([
      'Meeting Friday',
    ]);
  });

  it('rejects malformed filter values', () => {
    expect(ThreadListQuerySchema.safeParse({ view: 'inbox', unread: 'yes' }).success).toBe(false);
    expect(ThreadListQuerySchema.safeParse({ view: 'inbox', searchField: 'body' }).success).toBe(
      false,
    );
  });
});

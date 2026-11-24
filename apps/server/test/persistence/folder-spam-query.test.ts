import type { ThreadFolderQuery } from '@relay/engine';
import type { FolderView, ThreadSummary, UserId } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  at,
  buildMessage,
  buildThread,
  newId,
  seedAccount,
  type SeededAccount,
} from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const query = (view: FolderView): ThreadFolderQuery => ({
  view,
  accountId: null,
  splitId: null,
  labelId: null,
  mailboxId: null,
  search: null,
  cursor: null,
  limit: 50,
});

describe('PgThreadRepository.queryFolder spam view', () => {
  const context = usePgTestContext();
  let work: SeededAccount;

  const subjects = async (userId: UserId, view: FolderView) =>
    (await context.repositories.threads.queryFolder(userId, query(view))).items.map(
      (thread) => thread.subject,
    );

  const busyThread = async (subject: string, state: ThreadSummary['state'], minute: number) => {
    const { repositories } = context;
    const thread = buildThread(work.account.id, { subject, lastMessageAt: at(minute), state });
    await repositories.messages.upsert(buildMessage(thread, work.mailboxes.sent), new Map());
    await repositories.threads.upsert(thread);
    await repositories.tasks.upsert({
      id: newId('task'),
      userId: work.user.id,
      threadId: thread.id,
      jiraKey: null,
      title: 'Overiť odosielateľa',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      priority: 'none',
      createdAt: at(minute),
      updatedAt: at(minute),
    });
    const draftId = newId('draft');
    await repositories.drafts.create(work.user.id, {
      id: draftId,
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: `Re: ${subject}`,
      body: 'Nie, ďakujem',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: at(minute),
      updatedAt: at(minute),
    });
    await repositories.scheduledSends.create({
      id: newId('scheduledSend'),
      userId: work.user.id,
      accountId: work.account.id,
      draftId,
      scheduledAt: at(600),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(minute),
    });
  };

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    await busyThread('active', 'inbox', 1);
    await busyThread('spam', 'spam', 2);
  });

  it('serves spam threads in the spam view only', async () => {
    await expect(subjects(work.user.id, 'spam')).resolves.toEqual(['spam']);
    for (const view of ['tasks', 'sent', 'drafts', 'scheduled'] as const) {
      const found = await subjects(work.user.id, view);
      expect(found).toContain('active');
      expect(found).not.toContain('spam');
    }
    for (const view of ['inbox', 'done', 'trash'] as const) {
      await expect(subjects(work.user.id, view)).resolves.not.toContain('spam');
    }
  });
});

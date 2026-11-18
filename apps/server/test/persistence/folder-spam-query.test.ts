import type { ThreadFolderQuery } from '@relay/engine';
import type { FolderView, UserId } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  at,
  buildMessage,
  buildThread,
  newId,
  seedAccount,
  seedThread,
  type SeededAccount,
} from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const query = (view: FolderView): ThreadFolderQuery => ({
  view,
  accountId: null,
  splitId: null,
  labelId: null,
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

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    await seedThread(context.repositories, work, { subject: 'inbox', lastMessageAt: at(1) });
    const spam = buildThread(work.account.id, {
      subject: 'spam',
      lastMessageAt: at(2),
      state: 'spam',
    });
    await context.repositories.messages.upsert(buildMessage(spam, work.mailboxes.sent), new Map());
    await context.repositories.threads.upsert(spam);
    await context.repositories.tasks.upsert({
      id: newId('task'),
      userId: work.user.id,
      threadId: spam.id,
      jiraKey: null,
      title: 'Overiť odosielateľa',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: at(2),
      updatedAt: at(2),
    });
    await context.repositories.drafts.create(work.user.id, {
      id: newId('draft'),
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: spam',
      body: 'Nie, ďakujem',
      inReplyToThreadId: spam.id,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: at(2),
      updatedAt: at(2),
    });
  });

  it('serves spam threads in the spam view only', async () => {
    await expect(subjects(work.user.id, 'spam')).resolves.toEqual(['spam']);
    for (const view of ['inbox', 'done', 'trash', 'tasks', 'sent', 'drafts'] as const) {
      await expect(subjects(work.user.id, view)).resolves.not.toContain('spam');
    }
    await expect(subjects(work.user.id, 'inbox')).resolves.toEqual(['inbox']);
  });
});

import { DraftIdSchema, ScheduledSendIdSchema, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { threadId } from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const STAMP = '2026-11-10T10:00:00.000Z';

describe('SqliteThreadRepository.queryFolder spam view', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  const busyThread = async (id: string, state: 'inbox' | 'spam') => {
    await addThread(store, work, id, { state }, { mailboxId: work.sent.id });
    await store.repositories.tasks.upsert({
      id: TaskIdSchema.parse(`tsk-${id}`),
      userId: LOCAL_USER_ID,
      threadId: threadId(id),
      jiraKey: null,
      title: 'Overiť odosielateľa',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    const draftId = DraftIdSchema.parse(`drf-${id}`);
    await store.repositories.drafts.create(LOCAL_USER_ID, {
      id: draftId,
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: Výhra',
      body: 'Nie, ďakujem',
      inReplyToThreadId: threadId(id),
      inReplyToMessageId: null,
      attachments: [],
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    await store.repositories.scheduledSends.create({
      id: ScheduledSendIdSchema.parse(`sch-${id}`),
      userId: LOCAL_USER_ID,
      accountId: work.account.id,
      draftId,
      scheduledAt: '2026-11-20T08:00:00.000Z',
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: STAMP,
    });
  };

  it('shows spam threads in the spam view only, even with a task, sent mail or a draft', async () => {
    await busyThread('t-active', 'inbox');
    await busyThread('t-spam', 'spam');

    expect(await folderIds(store, { view: 'spam' })).toEqual(['t-spam']);
    for (const view of ['tasks', 'sent', 'drafts', 'scheduled'] as const) {
      const ids = await folderIds(store, { view });
      expect(ids).toContain('t-active');
      expect(ids).not.toContain('t-spam');
    }
    for (const view of ['inbox', 'done', 'trash'] as const) {
      expect(await folderIds(store, { view })).not.toContain('t-spam');
    }
  });
});

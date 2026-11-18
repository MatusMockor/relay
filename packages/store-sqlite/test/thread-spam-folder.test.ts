import { DraftIdSchema, TaskIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { threadId } from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

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

  it('shows spam threads in the spam view only, even with a task, sent mail or a draft', async () => {
    await addThread(store, work, 't-inbox');
    await addThread(store, work, 't-spam', { state: 'spam' }, { mailboxId: work.sent.id });
    await store.repositories.tasks.upsert({
      id: TaskIdSchema.parse('tsk-spam'),
      userId: LOCAL_USER_ID,
      threadId: threadId('t-spam'),
      jiraKey: null,
      title: 'Overiť odosielateľa',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    });
    await store.repositories.drafts.create(LOCAL_USER_ID, {
      id: DraftIdSchema.parse('drf-spam'),
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: Výhra',
      body: 'Nie, ďakujem',
      inReplyToThreadId: threadId('t-spam'),
      inReplyToMessageId: null,
      attachments: [],
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    });

    expect(await folderIds(store, { view: 'spam' })).toEqual(['t-spam']);
    for (const view of ['inbox', 'done', 'trash', 'tasks', 'sent', 'drafts'] as const) {
      expect(await folderIds(store, { view })).not.toContain('t-spam');
    }
    expect(await folderIds(store, { view: 'inbox' })).toEqual(['t-inbox']);
  });
});

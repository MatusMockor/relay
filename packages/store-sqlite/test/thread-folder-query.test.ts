import { ValidationError } from '@relay/engine';
import {
  DraftIdSchema,
  LabelIdSchema,
  ScheduledSendIdSchema,
  SplitIdSchema,
  TaskIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, threadId } from './support/fixtures';
import { addThread, folderIds, folderQuery } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteThreadRepository.queryFolder', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  describe('cursor pagination', () => {
    beforeEach(async () => {
      await addThread(store, work, 't-a', { lastMessageAt: '2026-11-10T10:00:00.000Z' });
      await addThread(store, work, 't-b', { lastMessageAt: '2026-11-10T12:00:00+02:00' });
      await addThread(store, work, 't-c', { lastMessageAt: '2026-11-10T10:00:00.000Z' });
      await addThread(store, work, 't-d', { lastMessageAt: '2026-11-11T08:00:00.000Z' });
      await addThread(store, work, 't-e', { lastMessageAt: '2026-11-09T08:00:00.000Z' });
    });

    it('orders by last message time and id, normalizing offsets', async () => {
      expect(await folderIds(store, {})).toEqual(['t-d', 't-c', 't-b', 't-a', 't-e']);
    });

    it('walks every page exactly once with a stable cursor across ties', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await store.repositories.threads.queryFolder(
          LOCAL_USER_ID,
          folderQuery({ cursor, limit: 2 }),
        );
        seen.push(...page.items.map((thread) => thread.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== null);

      expect(seen).toEqual(['t-d', 't-c', 't-b', 't-a', 't-e']);
      expect(pages).toBe(3);
    });

    it('returns no next cursor when the page is exactly full', async () => {
      const page = await store.repositories.threads.queryFolder(
        LOCAL_USER_ID,
        folderQuery({ limit: 5 }),
      );
      expect(page.items).toHaveLength(5);
      expect(page.nextCursor).toBeNull();
    });

    it('keeps the cursor valid when new threads arrive above it', async () => {
      const first = await store.repositories.threads.queryFolder(
        LOCAL_USER_ID,
        folderQuery({ limit: 2 }),
      );
      await addThread(store, work, 't-new', { lastMessageAt: '2026-11-12T08:00:00.000Z' });
      const second = await store.repositories.threads.queryFolder(
        LOCAL_USER_ID,
        folderQuery({ limit: 2, cursor: first.nextCursor }),
      );
      expect(second.items.map((thread) => thread.id)).toEqual(['t-b', 't-a']);
    });

    it('rejects malformed cursors and limits', async () => {
      const { threads } = store.repositories;
      await expect(
        threads.queryFolder(LOCAL_USER_ID, folderQuery({ cursor: 'not-a-cursor' })),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        threads.queryFolder(
          LOCAL_USER_ID,
          folderQuery({ cursor: Buffer.from('{"ts":"x"}').toString('base64url') }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        threads.queryFolder(LOCAL_USER_ID, folderQuery({ limit: 0 })),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('returns an empty page for an empty folder', async () => {
      const page = await store.repositories.threads.queryFolder(
        LOCAL_USER_ID,
        folderQuery({ view: 'trash' }),
      );
      expect(page).toEqual({ items: [], nextCursor: null });
    });
  });

  it('filters unified versus per-account folders', async () => {
    const personal = await seedAccount(store.repositories, {
      id: accountId('acc-2'),
      email: 'jan@osobne.sk',
    });
    await addThread(store, work, 't-work');
    await addThread(store, personal, 't-personal', { lastMessageAt: '2026-11-11T10:00:00.000Z' });

    expect(await folderIds(store, {})).toEqual(['t-personal', 't-work']);
    expect(await folderIds(store, { accountId: personal.account.id })).toEqual(['t-personal']);
    expect(await folderIds(store, { accountId: work.account.id })).toEqual(['t-work']);
  });

  it('maps thread states to the inbox, done, trash and reminders views', async () => {
    await addThread(store, work, 't-inbox');
    await addThread(store, work, 't-done', { state: 'done', markedDone: true });
    await addThread(store, work, 't-archived', { state: 'done' });
    await addThread(store, work, 't-trash', { state: 'trash' });
    await addThread(store, work, 't-reminder', {
      state: 'reminder',
      remindAt: '2026-11-20T08:00:00.000Z',
    });

    expect(await folderIds(store, { view: 'inbox' })).toEqual(['t-inbox']);
    expect(await folderIds(store, { view: 'done' })).toEqual(['t-done']);
    expect(await folderIds(store, { view: 'archive' })).toEqual(['t-archived']);
    expect(await folderIds(store, { view: 'trash' })).toEqual(['t-trash']);
    expect(await folderIds(store, { view: 'reminders' })).toEqual(['t-reminder']);
  });

  it('derives the tasks, sent, drafts and scheduled views', async () => {
    const { tasks, drafts, scheduledSends } = store.repositories;
    await addThread(store, work, 't-task', { state: 'done' });
    await addThread(store, work, 't-task-done');
    await addThread(store, work, 't-sent', {}, { mailboxId: work.sent.id });
    await addThread(store, work, 't-draft');
    await addThread(store, work, 't-scheduled');
    await addThread(store, work, 't-trashed-task', { state: 'trash' });
    const task = {
      userId: LOCAL_USER_ID,
      jiraKey: null,
      jiraActor: null,
      title: 'Zaplatiť faktúru',
      aiWhat: null,
      source: 'manual' as const,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    };
    await tasks.upsert({
      ...task,
      id: TaskIdSchema.parse('tsk-1'),
      threadId: threadId('t-task'),
      state: 'open',
    });
    await tasks.upsert({
      ...task,
      id: TaskIdSchema.parse('tsk-2'),
      threadId: threadId('t-task-done'),
      state: 'done',
    });
    await tasks.upsert({
      ...task,
      id: TaskIdSchema.parse('tsk-3'),
      threadId: threadId('t-trashed-task'),
      state: 'open',
    });
    const draft = {
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: Faktúra',
      body: 'Ďakujem',
      inReplyToMessageId: null,
      attachments: [],
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    };
    await drafts.create(LOCAL_USER_ID, {
      ...draft,
      id: DraftIdSchema.parse('drf-1'),
      inReplyToThreadId: threadId('t-draft'),
    });
    await drafts.create(LOCAL_USER_ID, {
      ...draft,
      id: DraftIdSchema.parse('drf-2'),
      inReplyToThreadId: threadId('t-scheduled'),
    });
    await scheduledSends.create({
      id: ScheduledSendIdSchema.parse('sch-1'),
      userId: LOCAL_USER_ID,
      accountId: work.account.id,
      draftId: DraftIdSchema.parse('drf-2'),
      scheduledAt: '2026-11-20T08:00:00.000Z',
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: '2026-11-10T10:00:00.000Z',
    });

    expect(await folderIds(store, { view: 'tasks' })).toEqual(['t-task']);
    expect(await folderIds(store, { view: 'sent' })).toEqual(['t-sent']);
    expect(await folderIds(store, { view: 'drafts' })).toEqual(['t-scheduled', 't-draft']);
    expect(await folderIds(store, { view: 'scheduled' })).toEqual(['t-scheduled']);
  });

  it('filters by split and hides exclusive splits from the main inbox', async () => {
    const exclusive = SplitIdSchema.parse('spl-jira');
    const shared = SplitIdSchema.parse('spl-vip');
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [
      {
        id: exclusive,
        userId: LOCAL_USER_ID,
        accountId: null,
        name: 'Jira',
        order: 0,
        exclusive: true,
        hideTasks: false,
        rules: [{ type: 'jira', projectKeys: [] }],
      },
      {
        id: shared,
        userId: LOCAL_USER_ID,
        accountId: null,
        name: 'VIP',
        order: 1,
        exclusive: false,
        hideTasks: false,
        rules: [{ type: 'fromDomain', domain: 'klient.sk' }],
      },
    ]);
    await addThread(store, work, 't-plain');
    await addThread(store, work, 't-jira', { splitIds: [exclusive] });
    await addThread(store, work, 't-vip', { splitIds: [shared] });

    expect(await folderIds(store, {})).toEqual(['t-vip', 't-plain']);
    expect(await folderIds(store, { splitId: exclusive })).toEqual(['t-jira']);
    expect(await folderIds(store, { splitId: shared })).toEqual(['t-vip']);
  });

  it('finds threads of exclusive splits when searching the main inbox', async () => {
    const jira = SplitIdSchema.parse('spl-jira');
    await store.repositories.splits.replaceAll(LOCAL_USER_ID, [
      {
        id: jira,
        userId: LOCAL_USER_ID,
        accountId: null,
        name: 'Jira',
        order: 0,
        exclusive: true,
        hideTasks: false,
        rules: [{ type: 'jira', projectKeys: [] }],
      },
    ]);
    await addThread(store, work, 't-plain', {}, { subject: 'Obed v piatok' });
    await addThread(
      store,
      work,
      't-jira',
      { splitIds: [jira] },
      { subject: 'REL-42 Oprava buildu' },
    );
    await addThread(
      store,
      work,
      't-jira-done',
      { splitIds: [jira], state: 'done' },
      { subject: 'REL-43 Oprava testov' },
    );

    expect(await folderIds(store, {})).toEqual(['t-plain']);
    expect(await folderIds(store, { search: '   ' })).toEqual(['t-plain']);
    expect(await folderIds(store, { search: 'oprava' })).toEqual(['t-jira']);
    expect(await folderIds(store, { search: 'dovolenka' })).toEqual([]);
  });

  it('filters by label', async () => {
    const label = LabelIdSchema.parse('lbl-faktury');
    await addThread(store, work, 't-labelled', { labelIds: [label] });
    await addThread(store, work, 't-other', { labelIds: [LabelIdSchema.parse('lbl-x')] });

    expect(await folderIds(store, { labelId: label })).toEqual(['t-labelled']);
  });
});

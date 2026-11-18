import type { ThreadFolderQuery } from '@relay/engine';
import { ValidationError } from '@relay/engine';
import type { Label, Split, ThreadSummary, UserId } from '@relay/shared/domain';
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

const query = (overrides: Partial<ThreadFolderQuery> = {}): ThreadFolderQuery => ({
  view: 'inbox',
  accountId: null,
  splitId: null,
  labelId: null,
  search: null,
  cursor: null,
  limit: 50,
  ...overrides,
});

describe('PgThreadRepository.queryFolder', () => {
  const context = usePgTestContext();
  let work: SeededAccount;
  let home: SeededAccount;
  let split: Split;
  let label: Label;
  const named = new Map<string, ThreadSummary>();
  const scheduledSendId = newId('scheduledSend');

  const ids = async (userId: UserId, overrides: Partial<ThreadFolderQuery>) =>
    (await context.repositories.threads.queryFolder(userId, query(overrides))).items.map(
      (thread) => thread.subject,
    );

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    home = await seedAccount(context.repositories, work.user);
    split = {
      id: newId('split'),
      userId: work.user.id,
      accountId: null,
      name: 'Newsletter',
      order: 0,
      rules: [{ type: 'fromDomain', domain: 'news.sk' }],
      exclusive: true,
      hideTasks: false,
    };
    await context.repositories.splits.replaceAll(work.user.id, [split]);
    label = { id: newId('label'), accountId: work.account.id, name: 'VIP', color: null };
    await context.repositories.labels.upsert(label);

    const seed = async (
      subject: string,
      seeded: SeededAccount,
      minute: number,
      overrides: Partial<ThreadSummary> = {},
    ) => {
      const { thread, message } = await seedThread(context.repositories, seeded, {
        subject,
        lastMessageAt: at(minute),
        ...overrides,
      });
      named.set(subject, thread);
      return { thread, message };
    };

    await seed('work-1', work, 1);
    const vip = await seed('work-2', work, 2);
    await context.repositories.messages.updateLabels(vip.message.id, [label.id]);
    await seed('home-1', home, 3);
    await seed('newsletter', work, 4, { splitIds: [split.id] });
    await seed('done', work, 5, { state: 'done' });
    await seed('trash', work, 6, { state: 'trash' });
    await seed('later', work, 7, { state: 'reminder', remindAt: at(500) });

    const sent = buildThread(work.account.id, {
      subject: 'sent',
      lastMessageAt: at(8),
      state: 'done',
    });
    await context.repositories.messages.upsert(buildMessage(sent, work.mailboxes.sent), new Map());
    await context.repositories.threads.upsert(sent);

    const task = await seed('task', work, 9);
    await context.repositories.tasks.upsert({
      id: newId('task'),
      userId: work.user.id,
      threadId: task.thread.id,
      jiraKey: 'REL-1',
      title: 'Opraviť build',
      aiWhat: null,
      state: 'open',
      source: 'jira',
      createdAt: at(9),
      updatedAt: at(9),
    });

    const replied = await seed('draft', work, 10);
    const draftId = newId('draft');
    await context.repositories.drafts.create(work.user.id, {
      id: draftId,
      accountId: work.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: draft',
      body: 'text',
      inReplyToThreadId: replied.thread.id,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: at(10),
      updatedAt: at(10),
    });
    await context.repositories.scheduledSends.create({
      id: scheduledSendId,
      userId: work.user.id,
      accountId: work.account.id,
      draftId,
      scheduledAt: at(600),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(10),
    });

    const stranger = await seedAccount(context.repositories);
    await seedThread(context.repositories, stranger, {
      subject: 'stranger',
      lastMessageAt: at(11),
    });
  });

  it('returns the unified inbox newest first without exclusive splits', async () => {
    await expect(ids(work.user.id, {})).resolves.toEqual([
      'draft',
      'task',
      'home-1',
      'work-2',
      'work-1',
    ]);
  });

  it('filters by account, split and label', async () => {
    await expect(ids(work.user.id, { accountId: home.account.id })).resolves.toEqual(['home-1']);
    await expect(ids(work.user.id, { splitId: split.id })).resolves.toEqual(['newsletter']);
    await expect(ids(work.user.id, { labelId: label.id })).resolves.toEqual(['work-2']);
    await expect(
      ids(work.user.id, { accountId: home.account.id, labelId: label.id }),
    ).resolves.toEqual([]);
  });

  it('serves every folder view', async () => {
    await expect(ids(work.user.id, { view: 'done' })).resolves.toEqual(['sent', 'done']);
    await expect(ids(work.user.id, { view: 'trash' })).resolves.toEqual(['trash']);
    await expect(ids(work.user.id, { view: 'reminders' })).resolves.toEqual(['later']);
    await expect(ids(work.user.id, { view: 'sent' })).resolves.toEqual(['sent']);
    await expect(ids(work.user.id, { view: 'tasks' })).resolves.toEqual(['task']);
    await expect(ids(work.user.id, { view: 'drafts' })).resolves.toEqual(['draft']);
    await expect(ids(work.user.id, { view: 'scheduled' })).resolves.toEqual(['draft']);
  });

  it('keeps a scheduled send in the scheduled view while it is being sent', async () => {
    await context.repositories.scheduledSends.claim(scheduledSendId, at(600));
    await expect(ids(work.user.id, { view: 'scheduled' })).resolves.toEqual(['draft']);

    await context.repositories.scheduledSends.markFailed(scheduledSendId, 'SMTP 550', at(600));
    await expect(ids(work.user.id, { view: 'scheduled' })).resolves.toEqual([]);
  });

  it('paginates with a stable cursor even when new threads arrive', async () => {
    const first = await context.repositories.threads.queryFolder(work.user.id, query({ limit: 2 }));
    expect(first.items.map((thread) => thread.subject)).toEqual(['draft', 'task']);
    expect(first.nextCursor).not.toBeNull();

    await seedThread(context.repositories, work, { subject: 'newest', lastMessageAt: at(100) });

    const second = await context.repositories.threads.queryFolder(
      work.user.id,
      query({ limit: 2, cursor: first.nextCursor }),
    );
    const third = await context.repositories.threads.queryFolder(
      work.user.id,
      query({ limit: 2, cursor: second.nextCursor }),
    );
    expect(second.items.map((thread) => thread.subject)).toEqual(['home-1', 'work-2']);
    expect(third.items.map((thread) => thread.subject)).toEqual(['work-1']);
    expect(third.nextCursor).toBeNull();
  });

  it('breaks timestamp ties by id', async () => {
    const tied = await seedAccount(context.repositories);
    const subjects = ['a', 'b', 'c'];
    for (const subject of subjects) {
      await seedThread(context.repositories, tied, { subject, lastMessageAt: at(30) });
    }
    const pages: string[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 3; index += 1) {
      const page = await context.repositories.threads.queryFolder(
        tied.user.id,
        query({ limit: 1, cursor }),
      );
      pages.push(...page.items.map((thread) => thread.subject));
      cursor = page.nextCursor;
    }
    expect([...pages].sort()).toEqual(subjects);
    expect(cursor).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    await expect(
      context.repositories.threads.queryFolder(work.user.id, query({ cursor: 'not-a-cursor' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('maps full summaries', async () => {
    const page = await context.repositories.threads.queryFolder(
      work.user.id,
      query({ labelId: label.id }),
    );
    expect(page.items).toEqual([{ ...named.get('work-2'), labelIds: [label.id] }]);
  });
});

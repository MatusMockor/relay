import { AutomationIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { addThread } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const AUTOMATION_ID = AutomationIdSchema.parse('automation-1');

describe('SqliteAutomationCandidateRepository', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('lists the newest inbox threads of the account with their match subjects', async () => {
    await addThread(store, work, 't-old', { lastMessageAt: '2026-11-10T10:00:00.000Z' });
    await addThread(store, work, 't-new', {
      lastMessageAt: '2026-11-12T10:00:00.000Z',
      jiraKey: 'EF-1',
    });
    await addThread(store, work, 't-mid', { lastMessageAt: '2026-11-11T10:00:00.000Z' });
    await addThread(store, work, 't-done', {
      lastMessageAt: '2026-11-13T10:00:00.000Z',
      state: 'done',
    });
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId('t-new-reply'),
        threadId: threadId('t-new'),
        accountId: work.account.id,
        mailboxId: work.inbox.id,
        uid: 900,
        date: '2026-11-12T11:00:00.000Z',
        subject: 'Re: odpoveď',
      }),
      NO_HEADERS,
    );

    const candidates = await store.repositories.automationCandidates.listInbox(work.account.id, 2);

    expect(candidates.map((candidate) => [candidate.threadId, candidate.jiraKey])).toEqual([
      ['t-new', 'EF-1'],
      ['t-mid', null],
    ]);
    expect(candidates[0]?.messages.map((item) => item.messageId)).toEqual([
      't-new-msg',
      't-new-reply',
    ]);
    expect(candidates[0]?.messages[1]?.subject).toMatchObject({
      subject: 'Re: odpoveď',
      hasAttachments: false,
    });
  });

  it('lists recent received mail of the account outside trash and spam', async () => {
    const since = '2026-11-01T00:00:00.000Z';
    await addThread(store, work, 't-archived', {
      lastMessageAt: '2026-11-12T10:00:00.000Z',
      state: 'done',
    });
    await addThread(store, work, 't-inbox', { lastMessageAt: '2026-11-13T10:00:00.000Z' });
    await addThread(store, work, 't-old', { lastMessageAt: '2026-10-01T10:00:00.000Z' });
    await addThread(store, work, 't-trash', {
      lastMessageAt: '2026-11-14T10:00:00.000Z',
      state: 'trash',
    });
    await addThread(
      store,
      work,
      't-sent',
      { lastMessageAt: '2026-11-11T10:00:00.000Z', state: 'done' },
      { mailboxId: work.sent.id, date: '2026-11-11T10:00:00.000Z' },
    );
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId('t-inbox-early'),
        threadId: threadId('t-inbox'),
        accountId: work.account.id,
        mailboxId: work.inbox.id,
        uid: 901,
        date: '2026-10-20T10:00:00.000Z',
      }),
      NO_HEADERS,
    );
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId('t-inbox-new'),
        threadId: threadId('t-inbox'),
        accountId: work.account.id,
        mailboxId: work.inbox.id,
        uid: 902,
        date: '2026-11-13T10:00:00.000Z',
      }),
      NO_HEADERS,
    );

    const candidates = await store.repositories.automationCandidates.listRecent(work.account.id, {
      since,
      limit: 10,
    });

    expect(candidates.map((candidate) => candidate.threadId)).toEqual(['t-inbox', 't-archived']);
    expect(candidates[0]?.messages.map((item) => item.messageId)).toEqual([
      't-inbox-msg',
      't-inbox-new',
    ]);
  });

  it('keeps only the newest messages of a long thread and finds messages by id', async () => {
    await addThread(store, work, 't-long', { lastMessageAt: '2026-11-12T10:00:00.000Z' });
    for (let index = 0; index < 55; index += 1) {
      await store.repositories.messages.upsert(
        buildMessage({
          id: messageId(`t-long-${String(index).padStart(2, '0')}`),
          threadId: threadId('t-long'),
          accountId: work.account.id,
          mailboxId: work.inbox.id,
          uid: 1000 + index,
          date: new Date(Date.parse('2026-11-11T00:00:00.000Z') + index * 60_000).toISOString(),
        }),
        NO_HEADERS,
      );
    }

    const [candidate] = await store.repositories.automationCandidates.listInbox(work.account.id, 1);
    const ids = candidate?.messages.map((item) => item.messageId) ?? [];
    const found = await store.repositories.automationCandidates.findMessages(LOCAL_USER_ID, [
      messageId('t-long-54'),
      messageId('t-long-msg'),
      messageId('missing'),
    ]);

    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe('t-long-05');
    expect(ids.at(-1)).toBe('t-long-54');
    expect(found.map((message) => message.id).sort()).toEqual(['t-long-54', 't-long-msg']);
  });

  it('releases claimed automation runs so they can be claimed again', async () => {
    await addThread(store, work, 't-run');
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [
      {
        id: AUTOMATION_ID,
        userId: LOCAL_USER_ID,
        accountId: null,
        name: 'Pravidlo',
        enabled: true,
        order: 0,
        preset: null,
        match: 'all',
        conditions: [{ type: 'hasAttachment' }],
        exceptions: [],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
        actions: [{ type: 'markRead' }],
      },
    ]);
    const run = {
      userId: LOCAL_USER_ID,
      automationId: AUTOMATION_ID,
      messageId: messageId('t-run-msg'),
      createdAt: '2026-11-17T10:00:00.000Z',
    };

    expect(await store.repositories.automationRuns.claim(run)).toBe(true);
    await store.repositories.automationRuns.release(run.automationId, [run.messageId]);

    expect(await store.repositories.automationRuns.claim(run)).toBe(true);
    expect(await store.repositories.automationRuns.claim(run)).toBe(false);
  });
});

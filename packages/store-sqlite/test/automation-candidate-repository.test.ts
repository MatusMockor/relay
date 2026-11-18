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
        conditions: [{ type: 'hasAttachment' }],
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

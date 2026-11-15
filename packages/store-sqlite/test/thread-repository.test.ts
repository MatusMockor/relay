import { LabelIdSchema, SplitIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildMessage, buildThread, NO_HEADERS, threadId, userId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteThreadRepository', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('round-trips a thread summary including splits and labels', async () => {
    const { threads } = store.repositories;
    const thread = buildThread({
      splitIds: [SplitIdSchema.parse('spl-b'), SplitIdSchema.parse('spl-a')],
      labelIds: [LabelIdSchema.parse('lbl-1')],
      jiraKey: 'REL-12',
      jiraActor: 'Peter Novák',
      remindAt: null,
      hasDraft: true,
    });

    await threads.upsert(thread);

    expect(await threads.findById(LOCAL_USER_ID, thread.id)).toEqual({
      ...thread,
      splitIds: ['spl-a', 'spl-b'],
    });
    expect(await threads.findByIdForAccount(seeded.account.id, thread.id)).not.toBeNull();
    expect(await threads.findById(userId('intruder'), thread.id)).toBeNull();
  });

  it('replaces the thread on upsert', async () => {
    const { threads } = store.repositories;
    await threads.upsert(buildThread({ splitIds: [SplitIdSchema.parse('spl-a')] }));
    await threads.upsert(buildThread({ messageCount: 3, unread: false, splitIds: [] }));

    expect(await threads.findById(LOCAL_USER_ID, threadId('thr-1'))).toMatchObject({
      messageCount: 3,
      unread: false,
      splitIds: [],
    });
  });

  it('updates the state, reminder and one-liner', async () => {
    const { threads } = store.repositories;
    await threads.upsert(buildThread());

    const reminded = await threads.updateState(LOCAL_USER_ID, threadId('thr-1'), {
      state: 'reminder',
      remindAt: '2026-11-12T08:00:00.000Z',
    });
    await threads.setAiOneLiner(threadId('thr-1'), 'Klient posiela faktúru');

    expect(reminded).toMatchObject({ state: 'reminder', remindAt: '2026-11-12T08:00:00.000Z' });
    expect((await threads.findById(LOCAL_USER_ID, threadId('thr-1')))?.aiOneLiner).toBe(
      'Klient posiela faktúru',
    );
    expect(
      await threads.updateState(userId('intruder'), threadId('thr-1'), {
        state: 'trash',
        remindAt: null,
      }),
    ).toBeNull();
  });

  it('deletes a thread together with its messages', async () => {
    const { threads, messages } = store.repositories;
    await threads.upsert(buildThread());
    await messages.upsert(buildMessage({ mailboxId: seeded.inbox.id }), NO_HEADERS);

    await threads.delete(threadId('thr-1'));

    expect(await threads.findById(LOCAL_USER_ID, threadId('thr-1'))).toBeNull();
    expect(await messages.listByThread(LOCAL_USER_ID, threadId('thr-1'))).toEqual([]);
  });
});

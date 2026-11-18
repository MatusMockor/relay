import { LabelIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildMessage, buildThread, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);

describe('threads carrying a label in SQLite', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
    await store.repositories.labels.upsert({
      id: labelId('lbl-1'),
      accountId: seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktúry',
    });
  });

  afterEach(() => {
    store.database.close();
  });

  const seedMessage = async (id: string, thread: string, uid: number, labelled: boolean) => {
    await store.repositories.threads.upsert(
      buildThread({ id: threadId(thread), labelIds: labelled ? [labelId('lbl-1')] : [] }),
    );
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId(id),
        threadId: threadId(thread),
        mailboxId: seeded.inbox.id,
        uid,
        messageIdHeader: `<${id}@klient.sk>`,
        labelIds: labelled ? [labelId('lbl-1')] : [],
      }),
      NO_HEADERS,
    );
  };

  it('lists each labelled thread once and nothing after the label is deleted', async () => {
    await seedMessage('msg-1', 'thr-1', 1, true);
    await seedMessage('msg-2', 'thr-1', 2, true);
    await seedMessage('msg-3', 'thr-2', 3, true);
    await seedMessage('msg-4', 'thr-3', 4, false);
    const { messages, labels, threads } = store.repositories;

    expect((await messages.listThreadIdsByLabel(labelId('lbl-1'))).sort()).toEqual([
      'thr-1',
      'thr-2',
    ]);

    await labels.delete(LOCAL_USER_ID, labelId('lbl-1'));

    expect(await messages.listThreadIdsByLabel(labelId('lbl-1'))).toEqual([]);
    expect((await messages.findById(LOCAL_USER_ID, messageId('msg-1')))?.labelIds).toEqual([]);
    expect((await threads.findById(LOCAL_USER_ID, threadId('thr-1')))?.labelIds).toEqual([]);
    expect((await threads.findById(LOCAL_USER_ID, threadId('thr-2')))?.labelIds).toEqual([]);
  });
});

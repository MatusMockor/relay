import { LabelIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMailbox, buildMessage, mailboxId, messageId, NO_HEADERS } from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);

describe('SqliteThreadRepository.queryFolder for folders and labels', () => {
  let store: TestStore;
  let work: SeededAccount;
  const folderId = mailboxId('mbx-folder');

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    await store.repositories.mailboxes.upsertMany(work.account.id, [
      buildMailbox({
        id: folderId,
        accountId: work.account.id,
        name: 'Projekty',
        path: 'Projekty',
        role: 'custom',
      }),
    ]);
  });

  afterEach(() => {
    store.database.close();
  });

  it('lists threads with a message in the mailbox and leaves out held threads', async () => {
    await addThread(store, work, 't-folder', { state: 'done' }, { mailboxId: folderId });
    await addThread(store, work, 't-inbox');
    await addThread(store, work, 't-trash', { state: 'trash' }, { mailboxId: folderId });
    await addThread(store, work, 't-spam', { state: 'spam' }, { mailboxId: folderId });

    expect(await folderIds(store, { view: 'mailbox', mailboxId: folderId })).toEqual(['t-folder']);
    expect(await folderIds(store, { view: 'mailbox', mailboxId: work.inbox.id })).toEqual([
      't-inbox',
    ]);
  });

  it('shows a thread with several messages in the mailbox only once', async () => {
    const thread = await addThread(
      store,
      work,
      't-many',
      { state: 'done' },
      { mailboxId: folderId },
    );
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId('t-many-msg-2'),
        threadId: thread.id,
        accountId: work.account.id,
        mailboxId: folderId,
        uid: 9001,
      }),
      NO_HEADERS,
    );

    expect(await folderIds(store, { view: 'mailbox', mailboxId: folderId })).toEqual(['t-many']);
  });

  it('lists labelled threads outside the inbox and leaves out held threads', async () => {
    await store.repositories.labels.upsert({
      id: labelId('l-vip'),
      accountId: work.account.id,
      name: 'VIP',
      color: null,
      kind: 'gmail',
      remoteName: 'VIP',
    });
    await addThread(store, work, 't-inbox', { labelIds: [labelId('l-vip')] });
    await addThread(store, work, 't-done', { state: 'done', labelIds: [labelId('l-vip')] });
    await addThread(store, work, 't-trash', { state: 'trash', labelIds: [labelId('l-vip')] });
    await addThread(store, work, 't-plain', { state: 'done' });

    expect(await folderIds(store, { view: 'label', labelId: labelId('l-vip') })).toEqual([
      't-inbox',
      't-done',
    ]);
  });
});

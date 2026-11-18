import { LabelIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildMailbox, buildMessage, mailboxId, messageId, NO_HEADERS } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);

describe('SQLite repositories for custom folders and Gmail labels', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  const addFolder = async () => {
    const [folder] = await store.repositories.mailboxes.upsertMany(work.account.id, [
      buildMailbox({
        id: mailboxId('mbx-projects'),
        accountId: work.account.id,
        name: 'Projekty',
        path: 'Projekty',
        role: 'custom',
        subscribed: false,
        uidValidity: 77,
      }),
    ]);
    expect(folder).toBeDefined();
    return folder ?? work.inbox;
  };

  it('stores subscribed and UIDVALIDITY and updates them on the next upsert', async () => {
    const folder = await addFolder();
    expect(folder).toMatchObject({ role: 'custom', subscribed: false, uidValidity: 77 });

    await store.repositories.mailboxes.upsertMany(work.account.id, [
      { ...folder, subscribed: true, uidValidity: 78 },
    ]);
    await store.repositories.mailboxes.saveUidValidity(work.inbox.id, 5);

    const listed = await store.repositories.mailboxes.listForSync(work.account.id);
    expect(
      listed.map((mailbox) => [mailbox.path, mailbox.subscribed, mailbox.uidValidity]),
    ).toEqual([
      ['INBOX', true, 5],
      ['Projekty', true, 78],
      ['Sent', true, null],
    ]);
  });

  it('relocates a mailbox in place and keeps its messages and sync state', async () => {
    const folder = await addFolder();
    await store.repositories.messages.upsert(
      buildMessage({ accountId: work.account.id, mailboxId: folder.id, uid: 9 }),
      NO_HEADERS,
    );
    const state = {
      accountId: work.account.id,
      mailboxId: folder.id,
      uidValidity: 77,
      lastUid: 9,
      highestModseq: '12',
      uidNext: 10,
      messageCount: 1,
      initialWindow: null,
      syncedAt: '2026-11-10T10:00:00.000Z',
    };
    await store.repositories.syncStates.save(state);

    await store.repositories.mailboxes.relocate(folder.id, {
      path: 'Archív/Projekty',
      name: 'Projekty',
      delimiter: '/',
    });

    expect(await store.repositories.mailboxes.findById(folder.id)).toMatchObject({
      path: 'Archív/Projekty',
      name: 'Projekty',
      uidValidity: 77,
    });
    expect(await store.repositories.mailboxes.findByPath(work.account.id, 'Projekty')).toBeNull();
    expect(
      (await store.repositories.messages.findByLocation({ mailboxId: folder.id, uid: 9 }))?.id,
    ).toBe('msg-1');
    expect(await store.repositories.syncStates.find(folder.id)).toEqual(state);
  });

  it('keeps label kind and remote name and finds labels by them', async () => {
    const { labels } = store.repositories;
    await labels.upsert({
      id: labelId('l-kw'),
      accountId: work.account.id,
      name: 'Faktury',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktury',
    });
    await labels.upsert({
      id: labelId('l-gm'),
      accountId: work.account.id,
      name: 'Projekty/Alfa',
      color: null,
      kind: 'gmail',
      remoteName: 'Projekty/Alfa',
    });
    await labels.upsert({
      id: labelId('l-gm'),
      accountId: work.account.id,
      name: 'Projekty/Beta',
      color: '#ff0000',
      kind: 'gmail',
      remoteName: 'Projekty/Beta',
    });

    expect(await labels.findByRemoteName(work.account.id, 'gmail', 'Projekty/Alfa')).toBeNull();
    expect(await labels.findByRemoteName(work.account.id, 'gmail', 'Projekty/Beta')).toEqual({
      id: 'l-gm',
      accountId: work.account.id,
      name: 'Projekty/Beta',
      color: '#ff0000',
      kind: 'gmail',
      remoteName: 'Projekty/Beta',
    });
    expect(await labels.findByRemoteName(work.account.id, 'keyword', 'Projekty/Beta')).toBeNull();
    expect((await labels.listByKind(work.account.id, 'keyword')).map((label) => label.id)).toEqual([
      'l-kw',
    ]);
    expect((await labels.list(LOCAL_USER_ID, work.account.id)).map((label) => label.kind)).toEqual([
      'keyword',
      'gmail',
    ]);
  });

  it('stores the email id and finds every copy of a message by it', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      buildMessage({
        accountId: work.account.id,
        mailboxId: work.inbox.id,
        emailId: '1789',
        uid: 1,
      }),
      NO_HEADERS,
    );
    await messages.upsert(
      buildMessage({
        id: messageId('msg-2'),
        accountId: work.account.id,
        mailboxId: work.sent.id,
        emailId: '1789',
        uid: 2,
      }),
      NO_HEADERS,
    );
    await messages.upsert(
      buildMessage({
        id: messageId('msg-3'),
        accountId: work.account.id,
        mailboxId: work.inbox.id,
        uid: 3,
      }),
      NO_HEADERS,
    );

    const copies = await messages.findByEmailId(work.account.id, '1789');
    expect(copies.map((message) => [message.id, message.emailId])).toEqual([
      ['msg-1', '1789'],
      ['msg-2', '1789'],
    ]);
    expect(await messages.findByEmailId(work.account.id, 'missing')).toEqual([]);
  });
});

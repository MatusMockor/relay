import { type Draft, DraftIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, buildMessage, messageId, NO_HEADERS } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const draftId = (value: string) => DraftIdSchema.parse(value);

const buildDraft = (id: string, replied: string): Draft => ({
  id: draftId(id),
  accountId: accountId('acc-1'),
  to: [{ name: 'Jana', email: 'jana@klient.sk' }],
  cc: [],
  bcc: [],
  subject: 'Re: Ponuka',
  body: 'Ďakujem.',
  inReplyToThreadId: null,
  inReplyToMessageId: messageId(replied),
  attachments: [],
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
});

describe('SqliteDraftRepository reply references', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('points reply drafts at another copy of the replied message', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft('drf-1', 'msg-1'));
    await drafts.create(LOCAL_USER_ID, buildDraft('drf-2', 'msg-2'));

    await drafts.retargetReplies(messageId('msg-1'), messageId('msg-3'));

    const replied = async (id: string) =>
      (await drafts.findById(LOCAL_USER_ID, draftId(id)))?.inReplyToMessageId;
    expect(await replied('drf-1')).toBe('msg-3');
    expect(await replied('drf-2')).toBe('msg-2');
  });

  it('stores the keeper when a reply draft names a merged message id', async () => {
    const { drafts, messages } = store.repositories;
    await messages.upsert(
      buildMessage({ id: messageId('msg-keeper'), mailboxId: seeded.inbox.id }),
      NO_HEADERS,
    );
    store.database.sqlite
      .prepare('insert into message_aliases (alias_id, message_id) values (?, ?)')
      .run('msg-merged', 'msg-keeper');

    const created = await drafts.create(LOCAL_USER_ID, buildDraft('drf-1', 'msg-merged'));
    const plain = await drafts.create(LOCAL_USER_ID, {
      ...buildDraft('drf-2', 'msg-keeper'),
      inReplyToMessageId: null,
    });
    const updated = await drafts.update(
      LOCAL_USER_ID,
      plain.id,
      { inReplyToMessageId: messageId('msg-merged') },
      { expected: plain.updatedAt, next: '2026-11-10T10:01:00.000Z' },
    );

    expect(created.inReplyToMessageId).toBe('msg-keeper');
    expect(updated?.inReplyToMessageId).toBe('msg-keeper');
    expect((await drafts.findById(LOCAL_USER_ID, draftId('drf-1')))?.inReplyToMessageId).toBe(
      'msg-keeper',
    );
  });
});

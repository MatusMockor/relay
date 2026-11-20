import { describe, expect, it } from 'vitest';
import { createSqliteMessageUids } from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore } from './support/test-database';

describe('SqliteMessageUidLookup', () => {
  it('returns the stored rows of one mailbox for the given uids with their labels', async () => {
    const { database, repositories } = createTestStore();
    const { account, inbox, sent } = await seedAccount(repositories);
    const store = async (mailboxId: typeof inbox.id, uid: number, bodyState: 'local' | 'remote') =>
      repositories.messages.upsert(
        buildMessage({
          id: messageId(`${mailboxId}-${String(uid)}`),
          threadId: threadId(`thr-${String(uid)}`),
          accountId: account.id,
          mailboxId,
          uid,
          bodyState,
          textBody: bodyState === 'local' ? 'telo' : null,
        }),
        NO_HEADERS,
      );
    await store(inbox.id, 3, 'local');
    await store(inbox.id, 7, 'remote');
    await store(sent.id, 7, 'local');

    const found = await createSqliteMessageUids(database).findByUids(inbox.id, [9, 7, 3, 7]);

    expect(found.map(({ mailboxId, uid, bodyState }) => ({ mailboxId, uid, bodyState }))).toEqual([
      { mailboxId: inbox.id, uid: 3, bodyState: undefined },
      { mailboxId: inbox.id, uid: 7, bodyState: 'remote' },
    ]);
    await expect(createSqliteMessageUids(database).findByUids(inbox.id, [])).resolves.toEqual([]);
  });
});

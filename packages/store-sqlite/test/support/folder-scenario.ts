import type { ThreadFolderQuery } from '@relay/engine';
import type { Message, ThreadSummary } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import { buildMessage, buildThread, messageId, NO_HEADERS, threadId } from './fixtures';
import type { SeededAccount } from './seed';
import type { TestStore } from './test-database';

export const folderQuery = (overrides: Partial<ThreadFolderQuery> = {}): ThreadFolderQuery => ({
  view: 'inbox',
  accountId: null,
  splitId: null,
  labelId: null,
  search: null,
  cursor: null,
  limit: 50,
  ...overrides,
});

let uidCounter = 0;

export const addThread = async (
  store: TestStore,
  seeded: SeededAccount,
  id: string,
  thread: Partial<ThreadSummary> = {},
  message: Partial<Message> = {},
): Promise<ThreadSummary> => {
  uidCounter += 1;
  const summary = await store.repositories.threads.upsert(
    buildThread({ id: threadId(id), accountId: seeded.account.id, ...thread }),
  );
  await store.repositories.messages.upsert(
    buildMessage({
      id: messageId(`${id}-msg`),
      threadId: summary.id,
      accountId: seeded.account.id,
      mailboxId: seeded.inbox.id,
      uid: uidCounter,
      ...message,
    }),
    NO_HEADERS,
  );
  return summary;
};

export const folderIds = async (
  store: TestStore,
  query: Partial<ThreadFolderQuery>,
): Promise<string[]> =>
  (await store.repositories.threads.queryFolder(LOCAL_USER_ID, folderQuery(query))).items.map(
    (thread) => thread.id,
  );

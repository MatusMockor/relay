import type { Mailbox } from '@relay/shared/domain';
import { type BulkMailboxes, bulkSeedThreads } from './bulk-thread-seed';
import { buildMailbox, mailboxId } from './fixtures';
import { seedAccount } from './seed';
import {
  createTempDirectory,
  createTestStore,
  tempDatabasePath,
  type TestStore,
} from './test-database';

const NEWEST_TS = Date.parse('2026-11-20T10:00:00.000Z');

const EXTRA_MAILBOXES = [
  { id: 'mbx-archive', name: 'Archive', path: 'Archive', role: 'archive' },
  { id: 'mbx-projects', name: 'Projekty', path: 'Projekty', role: 'custom' },
  { id: 'mbx-tiny', name: 'Zmluvy', path: 'Zmluvy', role: 'custom' },
  { id: 'mbx-single', name: 'Daňový úrad', path: 'Danovy urad', role: 'custom' },
] as const;

export interface TimePosition {
  readonly ts: number;
  readonly id: string;
}

export interface FolderScale {
  readonly store: TestStore;
  readonly mailboxes: BulkMailboxes;
  readonly threadCount: number;
  readonly deepPosition: TimePosition;
  readonly tinyFolderThreads: number;
  readonly tearDown: () => void;
}

const deepPositionOf = (prefix: string, threadCount: number): TimePosition => {
  const index = Math.floor((threadCount * 3) / 4);
  return { ts: NEWEST_TS - index * 60_000, id: `${prefix}-t${String(index).padStart(7, '0')}` };
};

export const seedFolderScale = async (threadCount: number): Promise<FolderScale> => {
  const directory = createTempDirectory();
  const store = createTestStore(tempDatabasePath(directory));
  const work = await seedAccount(store.repositories);
  const stored = await store.repositories.mailboxes.upsertMany(
    work.account.id,
    EXTRA_MAILBOXES.map((mailbox) =>
      buildMailbox({ ...mailbox, id: mailboxId(mailbox.id), accountId: work.account.id }),
    ),
  );
  const byId = (id: string): Mailbox =>
    stored.find((mailbox) => mailbox.id === mailboxId(id)) ?? work.inbox;
  const mailboxes: BulkMailboxes = {
    inbox: work.inbox,
    sent: work.sent,
    archive: byId('mbx-archive'),
    folder: byId('mbx-projects'),
    tiny: byId('mbx-tiny'),
    single: byId('mbx-single'),
  };
  bulkSeedThreads(store, {
    account: work.account,
    mailboxes,
    count: threadCount,
    newestTs: NEWEST_TS,
  });
  return {
    store,
    mailboxes,
    threadCount,
    deepPosition: deepPositionOf(work.account.id, threadCount),
    tinyFolderThreads: Math.ceil((threadCount - 5) / 10_000),
    tearDown: () => {
      store.database.close();
      directory.remove();
    },
  };
};

import { type RawMessage, type RemoteSyncCursor, UidValidityChangedError } from '@relay/engine';
import type { MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';
import { chunk, searchUids } from './uid-batches';

const READ = { operation: 'fetch', retryOnDisconnect: true } as const;

interface PendingUids {
  readonly uidValidity: bigint;
  readonly uids: number[];
}

const requireSameUidValidity = (path: string, expected: bigint, mailbox: MailboxObject): void => {
  if (mailbox.uidValidity === expected) {
    return;
  }
  throw new UidValidityChangedError(path, Number(expected), Number(mailbox.uidValidity));
};

const firstUidToFetch = (
  path: string,
  mailbox: MailboxObject,
  cursor: RemoteSyncCursor | null,
): number => {
  if (cursor === null) {
    return 1;
  }
  requireSameUidValidity(path, BigInt(cursor.uidValidity), mailbox);
  return cursor.lastUid + 1;
};

const pendingUids = (
  connection: ImapConnection,
  path: string,
  cursor: RemoteSyncCursor | null,
): Promise<PendingUids> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    const uidValidity = mailbox.uidValidity;
    const fromUid = firstUidToFetch(path, mailbox, cursor);
    if (mailbox.exists === 0) {
      return { uidValidity, uids: [] };
    }
    const uids = await searchUids(client, { uid: `${String(fromUid)}:*` }, fromUid);
    return { uidValidity, uids };
  });

const fetchBatch = (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
): Promise<RawMessage[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, uidValidity, mailbox);
    const fetched = await client.fetchAll(uids, FULL_MESSAGE_QUERY, { uid: true });
    return fetched
      .map((message) => toRawMessage(path, message))
      .filter((message): message is RawMessage => message !== null)
      .sort((left, right) => left.uid - right.uid);
  });

export async function* fetchSince(
  connection: ImapConnection,
  path: string,
  cursor: RemoteSyncCursor | null,
  batchSize: number,
): AsyncIterable<RawMessage> {
  const pending = await pendingUids(connection, path, cursor);
  for (const batch of chunk(pending.uids, batchSize)) {
    yield* await fetchBatch(connection, path, pending.uidValidity, batch);
  }
}

import { ProviderError, type RawMessage, type RemoteSyncCursor } from '@relay/engine';
import type { MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';
import { chunk, sortedUids } from './uid-batches';

const READ = { operation: 'fetch', retryOnDisconnect: true } as const;

interface PendingUids {
  readonly uidValidity: bigint;
  readonly uids: number[];
}

export const firstUidToFetch = (
  mailbox: MailboxObject,
  cursor: RemoteSyncCursor | null,
): number => {
  if (cursor === null || BigInt(cursor.uidValidity) !== mailbox.uidValidity) {
    return 1;
  }
  return cursor.lastUid + 1;
};

const pendingUids = (
  connection: ImapConnection,
  path: string,
  cursor: RemoteSyncCursor | null,
): Promise<PendingUids> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    const uidValidity = mailbox.uidValidity;
    const fromUid = firstUidToFetch(mailbox, cursor);
    if (mailbox.exists === 0) {
      return { uidValidity, uids: [] };
    }
    const found = await client.search({ uid: `${String(fromUid)}:*` }, { uid: true });
    return { uidValidity, uids: sortedUids(found, fromUid) };
  });

const fetchBatch = (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
): Promise<RawMessage[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    if (mailbox.uidValidity !== uidValidity) {
      throw new ProviderError(`UIDVALIDITY of ${path} changed during fetch`);
    }
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

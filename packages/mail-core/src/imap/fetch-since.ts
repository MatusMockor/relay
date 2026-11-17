import type { RawMessage, RemoteSyncCursor } from '@relay/engine';
import type { MailboxObject } from 'imapflow';
import { fetchBatch, READ, requireSameUidValidity } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { chunk, searchUids } from './uid-batches';

interface PendingUids {
  readonly uidValidity: bigint;
  readonly uids: number[];
}

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

import type { RawMessage } from '@relay/engine';
import { fetchBatch } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { chunk } from './uid-batches';

const inRequestedOrder = (messages: readonly RawMessage[], uids: readonly number[]) => {
  const byUid = new Map(messages.map((message) => [message.uid, message]));
  return uids.flatMap((uid) => {
    const message = byUid.get(uid);
    return message === undefined ? [] : [message];
  });
};

export async function* fetchUids(
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  uids: readonly number[],
  batchSize: number,
): AsyncIterable<RawMessage> {
  for (const batch of chunk(uids, batchSize)) {
    const fetched = await fetchBatch(connection, path, BigInt(uidValidity), batch);
    yield* inRequestedOrder(fetched, batch);
  }
}

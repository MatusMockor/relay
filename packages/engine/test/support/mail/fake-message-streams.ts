import type { RawMessage, RemoteSyncCursor } from '../../../src';
import { failingItems } from './async-items';
import { toRaw } from './fake-records';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';

export const recordsSince = (
  mailbox: FakeMailbox,
  cursor: RemoteSyncCursor | null,
): RemoteMessageRecord[] =>
  [...mailbox.messages.values()]
    .filter((record) => record.uid > (cursor?.lastUid ?? 0))
    .sort((a, b) => a.uid - b.uid);

export const recordsOf = (mailbox: FakeMailbox, uids: readonly number[]): RemoteMessageRecord[] =>
  uids.flatMap((uid) => {
    const record = mailbox.messages.get(uid);
    return record === undefined ? [] : [record];
  });

export async function* streamRecords(
  server: FakeMailServer,
  path: string,
  records: readonly RemoteMessageRecord[],
): AsyncIterable<RawMessage> {
  for (const record of records) {
    if (server.interruptStreamAfter === 0) {
      server.interruptStreamAfter = null;
      yield* failingItems<RawMessage>(server.interruptStreamError ?? new Error('Connection reset'));
      return;
    }
    if (server.interruptStreamAfter !== null) {
      server.interruptStreamAfter -= 1;
    }
    server.streamedMessages.push({ path, uid: record.uid });
    yield await Promise.resolve(toRaw(path, record));
  }
}

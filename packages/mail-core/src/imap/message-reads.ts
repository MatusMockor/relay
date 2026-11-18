import type { RawMessage } from '@relay/engine';
import type { ImapConnection } from './imap-connection';
import { labelReadingOf } from './gmail-labels';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';
import { searchUids } from './uid-batches';

export const listUids = (connection: ImapConnection, path: string): Promise<number[]> =>
  connection.withMailbox(
    path,
    { operation: 'list uids', retryOnDisconnect: true },
    async (client, mailbox) => {
      if (mailbox.exists === 0) {
        return [];
      }
      return searchUids(client, { all: true });
    },
  );

export const fetchMessage = (
  connection: ImapConnection,
  path: string,
  uid: number,
): Promise<RawMessage | null> =>
  connection.withMailbox(
    path,
    { operation: 'fetch message', retryOnDisconnect: true },
    async (client, mailbox) => {
      if (mailbox.exists === 0) {
        return null;
      }
      const fetched = await client.fetchOne(String(uid), FULL_MESSAGE_QUERY, { uid: true });
      if (fetched === false || fetched.uid !== uid) {
        return null;
      }
      return toRawMessage(path, fetched, labelReadingOf(client));
    },
  );

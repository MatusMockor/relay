import type { RawMessage, UidListOptions } from '@relay/engine';
import type { ImapConnection } from './imap-connection';
import { labelReadingOf } from './gmail-labels';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';
import { newestUids, scopeQueries, searchScope } from './uid-scope';

export const listUids = (
  connection: ImapConnection,
  path: string,
  options: UidListOptions = {},
): Promise<number[]> =>
  connection.withMailbox(
    path,
    { operation: 'list uids', retryOnDisconnect: true },
    async (client, mailbox) => {
      if (options.newest !== undefined) {
        await client.noop();
        return newestUids(client, options.newest);
      }
      if (options.fresh === true) {
        await client.noop();
        return searchScope(client, scopeQueries(options));
      }
      if (mailbox.exists === 0) {
        return [];
      }
      return searchScope(client, scopeQueries(options));
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

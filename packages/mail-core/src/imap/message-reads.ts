import type { RawMessage, UidListOptions, UidRange } from '@relay/engine';
import type { SearchObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { labelReadingOf } from './gmail-labels';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';
import { searchUids } from './uid-batches';

const uidQuery = (range: UidRange | undefined): SearchObject =>
  range === undefined ? { all: true } : { uid: `${String(range.from)}:${String(range.to)}` };

const isEmptyRange = (range: UidRange | undefined): boolean =>
  range !== undefined &&
  (!Number.isInteger(range.from) ||
    !Number.isInteger(range.to) ||
    range.from < 1 ||
    range.to < range.from);

export const listUids = (
  connection: ImapConnection,
  path: string,
  options: UidListOptions = {},
): Promise<number[]> =>
  connection.withMailbox(
    path,
    { operation: 'list uids', retryOnDisconnect: true },
    async (client, mailbox) => {
      if (isEmptyRange(options.range)) {
        return [];
      }
      const query = uidQuery(options.range);
      if (options.fresh === true) {
        await client.noop();
        return searchUids(client, query);
      }
      if (mailbox.exists === 0) {
        return [];
      }
      return searchUids(client, query);
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

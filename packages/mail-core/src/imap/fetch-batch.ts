import { type RawMessage, UidValidityChangedError } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject, MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { labelReadingOf } from './gmail-labels';
import { FULL_MESSAGE_QUERY, toRawMessage } from './raw-message';

export const READ = { operation: 'fetch', retryOnDisconnect: true } as const;

export const requireSameUidValidity = (
  path: string,
  expected: bigint,
  mailbox: MailboxObject,
): void => {
  if (mailbox.uidValidity === expected) {
    return;
  }
  throw new UidValidityChangedError(path, Number(expected), Number(mailbox.uidValidity));
};

export const fetchObjects = (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
  query: FetchQueryObject,
): Promise<FetchMessageObject[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, uidValidity, mailbox);
    return client.fetchAll(uids, query, { uid: true });
  });

export const fetchBatch = (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
): Promise<RawMessage[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, uidValidity, mailbox);
    const fetched = await client.fetchAll(uids, FULL_MESSAGE_QUERY, { uid: true });
    const reading = labelReadingOf(client);
    return fetched
      .map((message) => toRawMessage(path, message, reading))
      .filter((message): message is RawMessage => message !== null)
      .sort((left, right) => left.uid - right.uid);
  });

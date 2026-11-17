import { type RawMessage, UidValidityChangedError } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject, MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
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

export const fetchBatch = async (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
): Promise<RawMessage[]> => {
  const fetched = await fetchObjects(connection, path, uidValidity, uids, FULL_MESSAGE_QUERY);
  return fetched
    .map((message) => toRawMessage(path, message))
    .filter((message): message is RawMessage => message !== null)
    .sort((left, right) => left.uid - right.uid);
};

import type { RemoteEmailId } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject } from 'imapflow';
import { fetchObjects } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { chunk, sortedUids } from './uid-batches';

export const EMAIL_ID_BATCH_SIZE = 1000;

const EMAIL_ID_QUERY: FetchQueryObject = { uid: true };

const toEmailId = (message: FetchMessageObject): RemoteEmailId => ({
  uid: message.uid,
  emailId: message.emailId === undefined || message.emailId === '' ? null : message.emailId,
});

export const fetchEmailIds = async (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  uids: readonly number[],
): Promise<RemoteEmailId[]> => {
  const resolved: RemoteEmailId[] = [];
  for (const batch of chunk(sortedUids(uids), EMAIL_ID_BATCH_SIZE)) {
    const fetched = await fetchObjects(
      connection,
      path,
      BigInt(uidValidity),
      batch,
      EMAIL_ID_QUERY,
    );
    resolved.push(...fetched.map(toEmailId));
  }
  return resolved.sort((left, right) => left.uid - right.uid);
};

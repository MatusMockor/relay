import type { RemoteThreadHeaders } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject } from 'imapflow';
import { fetchObjects } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { toIsoDate } from './raw-message';
import { chunk } from './uid-batches';

const THREAD_HEADERS_QUERY: FetchQueryObject = {
  uid: true,
  internalDate: true,
  envelope: true,
  headers: ['references'],
};

const MESSAGE_ID = /<[^<>\s]+>/g;

const messageIds = (value: string | undefined): string[] => value?.match(MESSAGE_ID) ?? [];

const references = (fetched: FetchMessageObject): string[] => {
  const text = fetched.headers?.toString('utf8') ?? '';
  return text
    .replace(/\r?\n[ \t]+/g, ' ')
    .split(/\r?\n/)
    .filter((line) => line.toLowerCase().startsWith('references:'))
    .flatMap((line) => messageIds(line.slice('references:'.length)));
};

const toThreadHeaders = (fetched: FetchMessageObject): RemoteThreadHeaders => {
  const internalDate = toIsoDate(fetched.internalDate);
  const envelope = fetched.envelope;
  const sent = envelope?.date;
  return {
    uid: fetched.uid,
    internalDate,
    date: sent === undefined || Number.isNaN(sent.getTime()) ? internalDate : sent.toISOString(),
    subject: envelope?.subject ?? '',
    messageId: messageIds(envelope?.messageId)[0] ?? null,
    inReplyTo: messageIds(envelope?.inReplyTo),
    references: references(fetched),
  };
};

export const fetchThreadHeaders = async (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  uids: readonly number[],
  batchSize: number,
): Promise<RemoteThreadHeaders[]> => {
  const headers: RemoteThreadHeaders[] = [];
  for (const batch of chunk(uids, batchSize)) {
    const fetched = await fetchObjects(
      connection,
      path,
      BigInt(uidValidity),
      batch,
      THREAD_HEADERS_QUERY,
    );
    headers.push(...fetched.map(toThreadHeaders));
  }
  return headers.sort((left, right) => left.uid - right.uid);
};

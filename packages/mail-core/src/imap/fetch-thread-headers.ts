import type { RemoteThreadHeaders } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject } from 'imapflow';
import { fetchObjects } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { toIsoDate } from './raw-message';
import { chunk } from './uid-batches';

const THREAD_HEADERS_QUERY: FetchQueryObject = {
  uid: true,
  internalDate: true,
  headers: ['message-id', 'in-reply-to', 'references'],
};

const MESSAGE_ID = /<[^<>\s]+>/g;

const headerIds = (lines: readonly string[], name: string): string[] =>
  lines
    .filter((line) => line.toLowerCase().startsWith(`${name}:`))
    .flatMap((line) => line.slice(name.length + 1).match(MESSAGE_ID) ?? []);

const toThreadHeaders = (fetched: FetchMessageObject): RemoteThreadHeaders => {
  const text = fetched.headers?.toString('utf8') ?? '';
  const lines = text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  return {
    uid: fetched.uid,
    internalDate: toIsoDate(fetched.internalDate),
    messageId: headerIds(lines, 'message-id')[0] ?? null,
    inReplyTo: headerIds(lines, 'in-reply-to'),
    references: headerIds(lines, 'references'),
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

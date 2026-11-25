import type { RemoteThreadHeaders } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject } from 'imapflow';
import { READ, requireSameUidValidity } from './fetch-batch';
import { labelReadingOf, type LabelReading, toGmailLabels } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { toKeywords, toMessageFlags } from './message-flags';
import { toIsoDate } from './raw-message';
import { chunk, uidSet } from './uid-batches';

const THREAD_HEADERS_QUERY: FetchQueryObject = {
  uid: true,
  flags: true,
  labels: true,
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

const toThreadHeaders = (
  fetched: FetchMessageObject,
  reading: LabelReading,
): RemoteThreadHeaders => {
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
    meta: {
      uid: fetched.uid,
      flags: toMessageFlags(fetched.flags),
      keywords: toKeywords(fetched.flags),
      labels: toGmailLabels(reading, fetched.labels),
      emailId: fetched.emailId === undefined || fetched.emailId === '' ? null : fetched.emailId,
      internalDate,
    },
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
    const batchHeaders = await connection.withMailbox(path, READ, async (client, mailbox) => {
      requireSameUidValidity(path, BigInt(uidValidity), mailbox);
      const fetched = await client.fetchAll(uidSet(batch), THREAD_HEADERS_QUERY, { uid: true });
      const reading = labelReadingOf(client);
      return fetched.map((message) => toThreadHeaders(message, reading));
    });
    headers.push(...batchHeaders);
  }
  return headers.sort((left, right) => left.uid - right.uid);
};

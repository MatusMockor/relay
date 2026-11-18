import type { RemoteFlagChange } from '@relay/engine';
import type { FetchMessageObject, FetchOptions, ImapFlow, MailboxObject } from 'imapflow';
import { labelReadingOf, type LabelReading, toGmailLabels } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { toKeywords, toMessageFlags } from './message-flags';
import { chunk, sortedUids } from './uid-batches';

const READ = { operation: 'fetch flags', retryOnDisconnect: true } as const;
const FLAG_QUERY = { uid: true, flags: true, labels: true } as const;
const UID_BATCH_SIZE = 500;

const parseModseq = (value: string): bigint | null => {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
};

export const flagFetchOptions = (mailbox: MailboxObject, sinceModseq: string): FetchOptions => {
  const since = parseModseq(sinceModseq);
  if (mailbox.highestModseq === undefined || mailbox.noModseq === true || since === null) {
    return { uid: true };
  }
  return { uid: true, changedSince: since };
};

const toFlagChange = (message: FetchMessageObject, reading: LabelReading): RemoteFlagChange => ({
  uid: message.uid,
  flags: toMessageFlags(message.flags),
  keywords: toKeywords(message.flags),
  labels: toGmailLabels(reading, message.labels),
  modseq: message.modseq === undefined ? null : message.modseq.toString(),
});

const fetchSelected = async (
  client: ImapFlow,
  uids: readonly number[],
  options: FetchOptions,
): Promise<FetchMessageObject[]> => {
  const fetched: FetchMessageObject[] = [];
  for (const batch of chunk(sortedUids(uids), UID_BATCH_SIZE)) {
    fetched.push(...(await client.fetchAll(batch.join(','), FLAG_QUERY, options)));
  }
  return fetched;
};

const fetchChanged = (
  client: ImapFlow,
  uids: readonly number[] | undefined,
  options: FetchOptions,
): Promise<FetchMessageObject[]> => {
  if (uids === undefined) {
    return client.fetchAll('1:*', FLAG_QUERY, options);
  }
  return fetchSelected(client, uids, options);
};

export const fetchFlagChanges = (
  connection: ImapConnection,
  path: string,
  sinceModseq: string,
  uids?: readonly number[],
): Promise<RemoteFlagChange[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    if (mailbox.exists === 0 || uids?.length === 0) {
      return [];
    }
    const fetched = await fetchChanged(client, uids, flagFetchOptions(mailbox, sinceModseq));
    const reading = labelReadingOf(client);
    return fetched
      .map((message) => toFlagChange(message, reading))
      .sort((left, right) => left.uid - right.uid);
  });

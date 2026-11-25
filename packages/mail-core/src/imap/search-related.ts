import type { RelatedSearchOptions } from '@relay/engine';
import type { SearchObject } from 'imapflow';
import { READ, requireSameUidValidity } from './fetch-batch';
import { hasGmailLabels } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { chunk, searchUids, sortedUids } from './uid-batches';

const ALL_HEADERS = ['message-id', 'in-reply-to', 'references'] as const;
const MESSAGE_ID_HEADERS = ['message-id'] as const;

const IDS_PER_SEARCH = 20;

const stripAngleBrackets = (messageId: string): string =>
  messageId.replace(/^</, '').replace(/>$/, '');

const quoted = (value: string): string => `"${value.replace(/(["\\])/g, '\\$1')}"`;

const gmailMessageIdQuery = (messageIds: readonly string[]): SearchObject => ({
  gmraw: messageIds.map((id) => `rfc822msgid:${quoted(stripAngleBrackets(id))}`).join(' OR '),
});

const headerQuery = (
  messageIds: readonly string[],
  headers: readonly string[],
  since?: Date,
): SearchObject => {
  const clauses: SearchObject[] = messageIds.flatMap((messageId) =>
    headers.map((header) => ({ header: { [header]: messageId } })),
  );
  const filter: SearchObject = clauses.length === 1 ? (clauses[0] ?? {}) : { or: clauses };
  return since === undefined ? filter : { ...filter, since };
};

export const searchRelated = (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  messageIds: readonly string[],
  options: RelatedSearchOptions = {},
): Promise<number[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, BigInt(uidValidity), mailbox);
    if (mailbox.exists === 0 || messageIds.length === 0) {
      return [];
    }
    const match = options.match ?? 'all';
    const useGmailRaw = match === 'message-id' && hasGmailLabels(client);
    const headers = match === 'message-id' ? MESSAGE_ID_HEADERS : ALL_HEADERS;
    const found: number[] = [];
    for (const batch of chunk([...new Set(messageIds)], IDS_PER_SEARCH)) {
      const query = useGmailRaw
        ? gmailMessageIdQuery(batch)
        : headerQuery(batch, headers, options.since);
      found.push(...(await searchUids(client, query)));
    }
    return sortedUids(found);
  });

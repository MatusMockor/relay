import type { SearchObject } from 'imapflow';
import { READ, requireSameUidValidity } from './fetch-batch';
import type { ImapConnection } from './imap-connection';
import { chunk, searchUids, sortedUids } from './uid-batches';

const RELATED_HEADERS = ['message-id', 'in-reply-to', 'references'] as const;

const IDS_PER_SEARCH = 20;

const relatedQuery = (messageIds: readonly string[]): SearchObject => ({
  or: messageIds.flatMap((messageId) =>
    RELATED_HEADERS.map((header) => ({ header: { [header]: messageId } })),
  ),
});

export const searchRelated = (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  messageIds: readonly string[],
): Promise<number[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, BigInt(uidValidity), mailbox);
    if (mailbox.exists === 0 || messageIds.length === 0) {
      return [];
    }
    const found: number[] = [];
    for (const batch of chunk([...new Set(messageIds)], IDS_PER_SEARCH)) {
      found.push(...(await searchUids(client, relatedQuery(batch))));
    }
    return sortedUids(found);
  });

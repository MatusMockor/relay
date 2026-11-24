import type { RemoteTextSearch, RemoteTextSearchResult } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import { asciiFold } from './ascii-fold';
import { READ, requireSameUidValidity } from './fetch-batch';
import { gmailRawQuery } from './gmail-raw-query';
import { hasGmailLabels } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { imapSearchAttributes } from './imap-search-attributes';
import { rawUidSearch } from './raw-uid-search';
import { sortedUids } from './uid-batches';

const EMPTY: RemoteTextSearchResult = { uids: [], complete: true };
const REJECTED: RemoteTextSearchResult = { uids: [], complete: false };

const searchGmail = async (
  client: ImapFlow,
  query: RemoteTextSearch,
): Promise<number[] | false> => {
  const found = await client.search({ gmraw: gmailRawQuery(query) }, { uid: true });
  if (found === false && !client.usable) {
    throw new Error('The IMAP connection closed during SEARCH');
  }
  return found;
};

const run = async (client: ImapFlow, query: RemoteTextSearch): Promise<number[] | false> => {
  const found = hasGmailLabels(client)
    ? await searchGmail(client, query)
    : await rawUidSearch(client, imapSearchAttributes(query));
  return found === false ? false : sortedUids(found);
};

const folded = (query: RemoteTextSearch): RemoteTextSearch | null => {
  const terms = query.terms.map(asciiFold);
  return terms.every((term, index) => term === query.terms[index]) ? null : { ...query, terms };
};

const newest = (uids: readonly number[], limit: number): RemoteTextSearchResult => ({
  uids: [...uids].reverse().slice(0, limit),
  complete: true,
});

const searchWithFallback = async (
  client: ImapFlow,
  query: RemoteTextSearch,
): Promise<RemoteTextSearchResult> => {
  const first = await run(client, query);
  if (first !== false) {
    return newest(first, query.limit);
  }
  const ascii = folded(query);
  if (ascii === null) {
    return REJECTED;
  }
  const retried = await run(client, ascii);
  return retried === false ? REJECTED : newest(retried, query.limit);
};

export const searchText = (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  query: RemoteTextSearch,
): Promise<RemoteTextSearchResult> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, BigInt(uidValidity), mailbox);
    if (mailbox.exists === 0 || query.terms.length === 0) {
      return EMPTY;
    }
    return searchWithFallback(client, query);
  });

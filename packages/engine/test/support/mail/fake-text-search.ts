import type { RemoteTextSearch, RemoteTextSearchResult } from '../../../src';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import { uidValidityMismatch } from './fake-uid-validity';

const headerValue = (source: string, name: string): string => {
  const line = source.split('\r\n').find((entry) => entry.toLowerCase().startsWith(`${name}:`));
  return line?.slice(name.length + 1) ?? '';
};

const haystackOf = (record: RemoteMessageRecord, query: RemoteTextSearch): string => {
  const source = new TextDecoder().decode(record.source);
  if (query.field === 'from') {
    return headerValue(source, 'from');
  }
  if (query.field === 'subject') {
    return headerValue(source, 'subject');
  }
  return source;
};

const matches = (record: RemoteMessageRecord, query: RemoteTextSearch): boolean => {
  const haystack = haystackOf(record, query).toLowerCase();
  const before = query.before?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    Date.parse(record.internalDate) < before &&
    query.terms.every((term) => haystack.includes(term.toLowerCase()))
  );
};

export const searchFakeText = async (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  uidValidity: number,
  query: RemoteTextSearch,
): Promise<RemoteTextSearchResult> => {
  server.textSearches.push({ path: mailbox.path, query });
  await server.beforeTextSearch?.(mailbox.path);
  const mismatch = uidValidityMismatch(mailbox, uidValidity);
  if (mismatch !== null) {
    return Promise.reject(mismatch);
  }
  if (server.failSearchIn === mailbox.path) {
    return Promise.reject(new Error(`SEARCH failed in ${mailbox.path}`));
  }
  const uids = [...mailbox.messages.values()]
    .filter((record) => matches(record, query))
    .map((record) => record.uid)
    .sort((left, right) => right - left);
  return { uids: uids.slice(0, query.limit), complete: !server.rejectTextSearch };
};

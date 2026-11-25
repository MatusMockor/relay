import type { RelatedSearchOptions } from '../../../src';
import type { FakeMailbox, FakeMailServer } from './fake-mail-server';
import { threadHeadersOf } from './fake-thread-headers';
import { uidValidityMismatch } from './fake-uid-validity';

export const searchRelatedRecords = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  uidValidity: number,
  messageIds: readonly string[],
  options: RelatedSearchOptions = {},
): Promise<number[]> => {
  server.relatedSearches.push({ path: mailbox.path, ids: [...messageIds], options });
  if (server.failSearchIn === mailbox.path) {
    return Promise.reject(new Error(`SEARCH failed in ${mailbox.path}`));
  }
  const mismatch = uidValidityMismatch(mailbox, uidValidity);
  if (mismatch !== null) {
    return Promise.reject(mismatch);
  }
  const wanted = new Set(messageIds);
  const match = options.match ?? 'all';
  const sinceMs = options.since === undefined ? Number.NEGATIVE_INFINITY : options.since.getTime();
  const related = [...mailbox.messages.values()].filter((record) => {
    if (Date.parse(record.internalDate) < sinceMs) {
      return false;
    }
    const headers = threadHeadersOf(record);
    const candidateIds =
      match === 'message-id'
        ? [headers.messageId]
        : [headers.messageId, ...headers.inReplyTo, ...headers.references];
    return candidateIds.some((id) => id !== null && wanted.has(id));
  });
  return Promise.resolve(related.map((record) => record.uid).sort((left, right) => left - right));
};

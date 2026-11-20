import type { FakeMailbox, FakeMailServer } from './fake-mail-server';
import { threadHeadersOf } from './fake-thread-headers';
import { uidValidityMismatch } from './fake-uid-validity';

export const searchRelatedRecords = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  uidValidity: number,
  messageIds: readonly string[],
): Promise<number[]> => {
  if (server.failSearchIn === mailbox.path) {
    return Promise.reject(new Error(`SEARCH failed in ${mailbox.path}`));
  }
  const mismatch = uidValidityMismatch(mailbox, uidValidity);
  if (mismatch !== null) {
    return Promise.reject(mismatch);
  }
  const wanted = new Set(messageIds);
  const related = [...mailbox.messages.values()].filter((record) => {
    const headers = threadHeadersOf(record);
    return [headers.messageId, ...headers.inReplyTo, ...headers.references].some(
      (id) => id !== null && wanted.has(id),
    );
  });
  return Promise.resolve(related.map((record) => record.uid).sort((left, right) => left - right));
};

import type { FakeMailbox } from './fake-mail-server';
import { threadHeadersOf } from './fake-thread-headers';
import { uidValidityMismatch } from './fake-uid-validity';

export const searchRelatedRecords = (
  mailbox: FakeMailbox,
  uidValidity: number,
  messageIds: readonly string[],
): Promise<number[]> => {
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

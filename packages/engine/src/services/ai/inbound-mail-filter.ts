import type { MailAccount } from '@relay/shared/domain';
import type { MessageHeaders } from '../../model/split-match-subject';
import type { InboxArrival } from '../sync/sync-arrivals';

const BULK_PRECEDENCE = new Set(['bulk', 'list', 'junk']);
const LIST_HEADERS = ['list-unsubscribe', 'list-id'];

const firstValue = (headers: MessageHeaders, name: string): string | null =>
  headers.get(name)?.[0]?.trim().toLowerCase() ?? null;

export const looksLikeBulkMail = (headers: MessageHeaders): boolean => {
  if (LIST_HEADERS.some((name) => (headers.get(name)?.length ?? 0) > 0)) {
    return true;
  }
  const precedence = firstValue(headers, 'precedence');
  if (precedence !== null && BULK_PRECEDENCE.has(precedence)) {
    return true;
  }
  const autoSubmitted = firstValue(headers, 'auto-submitted');
  return autoSubmitted !== null && autoSubmitted !== 'no';
};

export const isPersonalInbound = (account: MailAccount, arrival: InboxArrival): boolean => {
  const sender = arrival.message.from?.email.toLowerCase() ?? null;
  if (sender === null || sender === account.email.toLowerCase()) {
    return false;
  }
  return !looksLikeBulkMail(arrival.headers);
};

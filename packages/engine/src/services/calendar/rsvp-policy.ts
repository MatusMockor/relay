import type { MailAccount } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';

export const canRespond = (event: StoredCalendarEvent, account: MailAccount): boolean =>
  event.source.kind === 'invite' &&
  event.status !== 'cancelled' &&
  event.method === 'REQUEST' &&
  event.organizer !== null &&
  event.organizer.email.toLowerCase() !== account.email.toLowerCase();

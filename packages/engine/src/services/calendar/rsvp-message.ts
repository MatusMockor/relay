import type { CalendarRsvpResponse, MailAccount } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { OutgoingMessage } from '../../model/outgoing-message';

const SUBJECT_PREFIX: Record<CalendarRsvpResponse, string> = {
  accepted: 'Prijaté',
  tentative: 'Možno',
  declined: 'Odmietnuté',
};

const RESPONSE_TEXT: Record<CalendarRsvpResponse, string> = {
  accepted: 'Pozvánka bola prijatá.',
  tentative: 'Účasť je zatiaľ nepotvrdená.',
  declined: 'Pozvánka bola odmietnutá.',
};

export const buildRsvpMessage = (
  event: StoredCalendarEvent,
  account: MailAccount,
  response: CalendarRsvpResponse,
  ics: string,
  inReplyTo: string | null,
): OutgoingMessage => {
  const organizer = event.organizer ?? { name: null, email: account.email };
  const title = event.summary.trim() === '' ? 'Udalosť' : event.summary;
  return {
    from: { name: account.senderName, email: account.email },
    to: [organizer],
    cc: [],
    bcc: [],
    subject: `${SUBJECT_PREFIX[response]}: ${title}`,
    text: `${RESPONSE_TEXT[response]}\n\n${title}\n`,
    html: null,
    inReplyTo,
    references: inReplyTo === null ? [] : [inReplyTo],
    attachments: [],
    calendar: { method: 'REPLY', content: ics },
  };
};

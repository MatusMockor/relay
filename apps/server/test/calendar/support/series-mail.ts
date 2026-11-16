import { composeMime } from '@relay/mail-core';

export type SeriesMethod = 'REQUEST' | 'CANCEL';

export interface SeriesMessage {
  readonly method: SeriesMethod;
  readonly subject: string;
  readonly lines: readonly string[];
}

export interface SeriesParties {
  readonly uid: string;
  readonly organizer: string;
  readonly attendee: string;
}

export const seriesIcs = (parties: SeriesParties, message: SeriesMessage): string =>
  [
    'BEGIN:VCALENDAR',
    'PRODID:-//Relay//Series Test//EN',
    'VERSION:2.0',
    `METHOD:${message.method}`,
    'BEGIN:VEVENT',
    `UID:${parties.uid}`,
    `ORGANIZER;CN=Peter Král:mailto:${parties.organizer}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${parties.attendee}`,
    ...message.lines,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

export const seriesMail = async (
  parties: SeriesParties,
  message: SeriesMessage,
): Promise<Buffer> => {
  const content = seriesIcs(parties, message);
  const { raw } = await composeMime({
    from: { name: 'Peter Král', email: parties.organizer },
    to: [{ name: null, email: parties.attendee }],
    cc: [],
    bcc: [],
    subject: `${message.subject} [${parties.uid.split('@')[0] ?? ''}]`,
    text: 'Zmena v sérii stretnutí.',
    html: null,
    inReplyTo: null,
    references: [],
    attachments: [
      {
        filename: 'invite.ics',
        contentType: 'application/ics',
        content: new TextEncoder().encode(content),
      },
    ],
    calendar: { method: message.method, content },
  });
  return raw;
};

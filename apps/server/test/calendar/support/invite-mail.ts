import { composeMime } from '@relay/mail-core';

export interface InviteSpec {
  readonly uid: string;
  readonly organizer: string;
  readonly attendee: string;
  readonly summary: string;
  readonly sequence?: number;
}

export const inviteIcs = (spec: InviteSpec): string =>
  [
    'BEGIN:VCALENDAR',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'VERSION:2.0',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Bratislava',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Bratislava:20261116T100000',
    'DTEND;TZID=Europe/Bratislava:20261116T110000',
    'DTSTAMP:20261115T080000Z',
    `ORGANIZER;CN=Peter Král:mailto:${spec.organizer}`,
    `UID:${spec.uid}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Peter Král:mailto:${spec.organizer}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${spec.attendee}`,
    `SEQUENCE:${String(spec.sequence ?? 0)}`,
    'STATUS:CONFIRMED',
    `SUMMARY:${spec.summary}`,
    'LOCATION:Zasadačka Dunaj',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

export const inviteMail = async (spec: InviteSpec): Promise<Buffer> => {
  const { raw } = await composeMime({
    from: { name: 'Peter Král', email: spec.organizer },
    to: [{ name: null, email: spec.attendee }],
    cc: [],
    bcc: [],
    subject: `Pozvánka: ${spec.summary}`,
    text: 'Pozývam ťa na stretnutie.',
    html: null,
    inReplyTo: null,
    references: [],
    attachments: [
      {
        filename: 'invite.ics',
        contentType: 'application/ics',
        content: new TextEncoder().encode(inviteIcs(spec)),
      },
    ],
    calendar: { method: 'REQUEST', content: inviteIcs(spec) },
  });
  return raw;
};

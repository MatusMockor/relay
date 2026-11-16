import { describe, expect, it } from 'vitest';
import { composeMime, MailparserMessageParser } from '../../src';
import { FixedClock } from '../support/infrastructure';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Relay//Calendar 1.0//SK',
  'METHOD:REPLY',
  'BEGIN:VEVENT',
  'UID:evt-1@partner.test',
  'DTSTAMP:20261115T100000Z',
  'ATTENDEE;PARTSTAT=ACCEPTED;CN=Alica:mailto:alica@example.com',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const base = {
  from: { name: 'Alica', email: 'alica@example.com' },
  to: [{ name: null, email: 'peter@partner.test' }],
  cc: [],
  bcc: [],
  subject: 'Prijaté: Plánovanie',
  text: 'Pozvánka bola prijatá.',
  html: null,
  inReplyTo: null,
  references: [],
};

const parser = new MailparserMessageParser(new FixedClock(new Date('2026-11-15T10:00:00.000Z')));

describe('calendar parts', () => {
  it('composes an iMIP alternative with the method parameter and parses it back', async () => {
    const { raw } = await composeMime({
      ...base,
      attachments: [],
      calendar: { method: 'REPLY', content: ICS },
    });
    const text = raw.toString('utf8');
    expect(text).toMatch(/Content-Type: multipart\/alternative/);
    expect(text).toMatch(/Content-Type: text\/calendar; charset=utf-8; method=REPLY/);

    const parsed = await parser.parse(new Uint8Array(raw));
    expect(parsed.calendarParts).toEqual([ICS]);
    expect(parsed.textBody).toContain('Pozvánka bola prijatá.');
  });

  it('collects .ics attachments once even when the same invite is attached twice', async () => {
    const { raw } = await composeMime({
      ...base,
      attachments: [
        {
          filename: 'invite.ics',
          contentType: 'application/ics',
          content: new TextEncoder().encode(ICS),
        },
        {
          filename: 'pozvanka.ICS',
          contentType: 'application/octet-stream',
          content: new TextEncoder().encode(ICS),
        },
        {
          filename: 'notes.txt',
          contentType: 'text/plain',
          content: new TextEncoder().encode('BEGIN:VCALENDAR'),
        },
      ],
    });
    const parsed = await parser.parse(new Uint8Array(raw));
    expect(parsed.calendarParts).toEqual([ICS]);
  });

  it('marks the iMIP body alternative inline and keeps an attached .ics as a file', async () => {
    const { raw } = await composeMime({
      ...base,
      attachments: [],
      calendar: { method: 'REPLY', content: ICS },
    });
    const parsed = await parser.parse(new Uint8Array(raw));
    expect(
      parsed.attachments.map(({ filename, contentType, inline }) => ({
        filename,
        contentType,
        inline,
      })),
    ).toEqual([
      { filename: null, contentType: 'text/calendar', inline: true },
      { filename: 'invite.ics', contentType: 'application/ics', inline: false },
    ]);
  });

  it('returns no parts for ordinary mail', async () => {
    const { raw } = await composeMime({ ...base, attachments: [] });
    expect((await parser.parse(new Uint8Array(raw))).calendarParts).toEqual([]);
  });
});

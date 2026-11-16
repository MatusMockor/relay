import type { GreenMailUser } from '@relay/config/test-infra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeMime, ImapMailProvider } from '../../src';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { rawMail } from '../support/raw-mail';
import { RecordingClientFactory } from '../support/recording-client-factory';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Relay//Calendar 1.0//SK',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:evt-parts@partner.test',
  'DTSTAMP:20261115T100000Z',
  'DTSTART:20261120T090000Z',
  'DTEND:20261120T100000Z',
  'SUMMARY:Plánovanie šprintu',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const encoder = new TextEncoder();

const invitation = async (to: string): Promise<Uint8Array> => {
  const { raw } = await composeMime({
    from: { name: 'Peter', email: 'peter@partner.test' },
    to: [{ name: null, email: to }],
    cc: [],
    bcc: [],
    subject: 'Pozvánka',
    text: 'Pozývam ťa.',
    html: null,
    inReplyTo: null,
    references: [],
    attachments: [
      {
        filename: 'report.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array(200_000).fill(65),
      },
      { filename: 'invite.ics', contentType: 'application/ics', content: encoder.encode(ICS) },
    ],
    calendar: { method: 'REQUEST', content: ICS },
  });
  return new Uint8Array(raw);
};

const singlePart = (to: string): Uint8Array =>
  encoder.encode(
    [
      'From: Peter <peter@partner.test>',
      `To: ${to}`,
      'Subject: Pozvánka',
      'Date: Sun, 15 Nov 2026 10:00:00 +0100',
      'Message-ID: <single-part@partner.test>',
      'MIME-Version: 1.0',
      'Content-Type: text/calendar; charset=utf-8; method=REQUEST',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(ICS).toString('base64'),
      '',
    ].join('\r\n'),
  );

describe('ImapMailProvider.fetchCalendarParts against GreenMail', () => {
  let user: GreenMailUser;
  let provider: ImapMailProvider;
  let requested: string[];

  beforeEach(async () => {
    user = await createGreenMailUser();
    requested = [];
    const factory = new RecordingClientFactory(user, [], (client) => {
      const fetchOne = client.fetchOne.bind(client);
      client.fetchOne = (range, query, options) => {
        requested.push(...(query.source === undefined ? [] : ['source']));
        requested.push(...(query.bodyParts ?? []).map(String));
        return fetchOne(range, query, options);
      };
    });
    provider = new ImapMailProvider(factory);
  });

  afterEach(async () => {
    await provider.close();
    await deleteGreenMailUser(user);
  });

  it('downloads only the calendar sections of a multipart invitation', async () => {
    const { uid } = await provider.append('INBOX', await invitation(user.email), {});

    const parts = await provider.fetchCalendarParts('INBOX', uid ?? 0);

    expect(parts?.map((part) => part.trimEnd())).toEqual([ICS.trimEnd()]);
    expect(requested).toEqual(['1.2', '3', '4']);
  });

  it('reads a single-part text/calendar message from section 1', async () => {
    const { uid } = await provider.append('INBOX', singlePart(user.email), {});

    expect(await provider.fetchCalendarParts('INBOX', uid ?? 0)).toEqual([ICS]);
    expect(requested).toEqual(['TEXT']);
  });

  it('returns no parts for a plain message and null for a missing one', async () => {
    const { uid } = await provider.append(
      'INBOX',
      rawMail({ to: user.email, subject: 'Bez pozvánky' }),
      {},
    );

    expect(await provider.fetchCalendarParts('INBOX', uid ?? 0)).toEqual([]);
    expect(await provider.fetchCalendarParts('INBOX', (uid ?? 0) + 50)).toBeNull();
    expect(requested).toEqual([]);
  });
});

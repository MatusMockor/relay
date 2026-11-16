import type { AccountId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const ZONE = 'Europe/Bratislava';
const OUTLOOK_ZONE = 'Central Europe Standard Time';
const AUTUMN = {
  from: '2026-11-01T00:00:00+01:00',
  to: '2027-01-01T00:00:00+01:00',
  timeZone: ZONE,
};

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${OUTLOOK_ZONE}`,
  'BEGIN:STANDARD',
  'DTSTART:16010101T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:16010101T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const ics = (method: string, uid: string, attendee: string, lines: readonly string[]) =>
  [
    'BEGIN:VCALENDAR',
    `METHOD:${method}`,
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    'ORGANIZER;CN=Lucia Horváthová:mailto:lucia@corp.test',
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    `UID:${uid}`,
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const outlook = (time: string) => `TZID=${OUTLOOK_ZONE}:2026${time}`;

describe('local mode THISANDFUTURE invitations (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let me: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    me = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await me.remove();
    await dir.remove();
  });

  const send = (subject: string, method: string, uid: string, lines: readonly string[]) =>
    deliverMail(me, {
      from: 'Lucia <lucia@corp.test>',
      subject,
      text: 'Zmena v sérii.',
      attachments: [
        {
          filename: 'invite.ics',
          contentType: `text/calendar; method=${method}`,
          content: Buffer.from(ics(method, uid, me.email, lines)),
        },
      ],
    });

  const seriesOf = (accountId: AccountId, uid: string) =>
    harness.runtime.engine.repositories.calendarEvents.findSeries(
      { kind: 'invite', accountId },
      uid,
    );

  it('moves an Outlook series to Tuesday, ends it and cuts an all-day series', async () => {
    const weekly = 'outlook-weekly@corp.test';
    const duty = 'all-day-duty@corp.test';
    await send('Pozvánka: Porada', 'REQUEST', weekly, [
      'SUMMARY:Porada',
      `DTSTART;${outlook('1102T100000')}`,
      `DTEND;${outlook('1102T110000')}`,
      'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:0',
    ]);
    await send('Zmena: Porada v utorok', 'REQUEST', weekly, [
      'SUMMARY:Porada v utorok',
      `RECURRENCE-ID;RANGE=THISANDFUTURE;${outlook('1116T100000')}`,
      `DTSTART;${outlook('1117T100000')}`,
      `DTEND;${outlook('1117T110000')}`,
      'DTSTAMP:20261105T080000Z',
      'SEQUENCE:1',
    ]);
    await send('Zrušené: Porada od 30.11.', 'CANCEL', weekly, [
      `RECURRENCE-ID;RANGE=THISANDFUTURE;${outlook('1130T100000')}`,
      'STATUS:CANCELLED',
      'DTSTAMP:20261110T080000Z',
      'SEQUENCE:2',
    ]);
    await send('Pozvánka: Služba', 'REQUEST', duty, [
      'SUMMARY:Služba',
      'DTSTART;VALUE=DATE:20261116',
      'RRULE:FREQ=DAILY;COUNT=10',
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:0',
    ]);
    for (const subject of ['Zrušené: Služba od 19.11.', 'Zrušené: Služba od 19.11. (kópia)']) {
      await send(subject, 'CANCEL', duty, [
        'RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20261119',
        'DTSTAMP:20261110T080000Z',
        'SEQUENCE:1',
      ]);
    }

    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));

    const { items } = expectOk(await harness.bridge.invoke('local.calendar.occurrences', AUTUMN));
    expect(items.map((item) => [item.start, item.title, item.allDay])).toEqual([
      ['2026-11-02T09:00:00.000Z', 'Porada', false],
      ['2026-11-09T09:00:00.000Z', 'Porada', false],
      ['2026-11-15T23:00:00.000Z', 'Služba', true],
      ['2026-11-16T23:00:00.000Z', 'Služba', true],
      ['2026-11-17T09:00:00.000Z', 'Porada v utorok', false],
      ['2026-11-17T23:00:00.000Z', 'Služba', true],
      ['2026-11-24T09:00:00.000Z', 'Porada v utorok', false],
    ]);
    const weeklyRows = await seriesOf(account.id, weekly);
    expect(weeklyRows.find((row) => row.recurrenceId === null)?.rangeEndsAt).toBe(
      '2026-12-02T10:00:00.000Z',
    );
    const dutyRows = await seriesOf(account.id, duty);
    expect(dutyRows.map((row) => [row.recurrenceId, row.status, row.thisAndFuture])).toEqual([
      [null, 'confirmed', undefined],
      ['2026-11-19', 'cancelled', true],
    ]);
    expect(dutyRows.find((row) => row.recurrenceId === null)?.rangeEndsAt).toBe(
      '2026-11-21T00:00:00.000Z',
    );
    expect(dutyRows.find((row) => row.recurrenceId !== null)?.revision).toBe(1);
  });
});

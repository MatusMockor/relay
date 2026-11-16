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

  it('keeps a range change after its anchor is cancelled and restores a cut with a newer range', async () => {
    const anchor = 'anchor-daily@corp.test';
    const restore = 'restore-daily@corp.test';
    const daily = [
      'SUMMARY:Report',
      'DTSTART:20261101T090000Z',
      'DTEND:20261101T093000Z',
      'RRULE:FREQ=DAILY',
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:0',
    ];
    const at11 = (day: string, sequence: number) => [
      'SUMMARY:Report o 11:00',
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T110000Z`,
      `DTEND:202611${day}T113000Z`,
      'DTSTAMP:20261102T080000Z',
      `SEQUENCE:${String(sequence)}`,
    ];
    const cancel = (day: string, range: string, sequence: number) => [
      `RECURRENCE-ID${range}:202611${day}T090000Z`,
      'DTSTAMP:20261102T090000Z',
      `SEQUENCE:${String(sequence)}`,
    ];
    await send('Pozvánka: Report A', 'REQUEST', anchor, daily);
    await send('Report A o 11:00', 'REQUEST', anchor, at11('03', 1));
    await send('Zrušené: Report A 3.11.', 'CANCEL', anchor, cancel('03', '', 2));
    await send('Pozvánka: Report B', 'REQUEST', restore, daily);
    await send(
      'Zrušené: Report B od 3.11.',
      'CANCEL',
      restore,
      cancel('03', ';RANGE=THISANDFUTURE', 1),
    );
    await send('Report B znova od 5.11.', 'REQUEST', restore, at11('05', 2));

    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));

    const starts = async (from: string, to: string) =>
      expectOk(
        await harness.bridge.invoke('local.calendar.occurrences', { from, to, timeZone: 'UTC' }),
      )
        .items.map((item) => `${item.start} ${item.uid.split('-')[0] ?? ''}`)
        .sort();
    expect(await starts('2026-11-01T00:00:00Z', '2026-11-07T00:00:00Z')).toEqual([
      '2026-11-01T09:00:00.000Z anchor',
      '2026-11-01T09:00:00.000Z restore',
      '2026-11-02T09:00:00.000Z anchor',
      '2026-11-02T09:00:00.000Z restore',
      '2026-11-04T11:00:00.000Z anchor',
      '2026-11-05T11:00:00.000Z anchor',
      '2026-11-05T11:00:00.000Z restore',
      '2026-11-06T11:00:00.000Z anchor',
      '2026-11-06T11:00:00.000Z restore',
    ]);
    expect(await starts('2026-12-20T00:00:00Z', '2026-12-21T00:00:00Z')).toEqual([
      '2026-12-20T11:00:00.000Z anchor',
      '2026-12-20T11:00:00.000Z restore',
    ]);
    const restored = await seriesOf(account.id, restore);
    expect(restored.find((row) => row.recurrenceId === null)?.rangeEndsAt).toBeNull();
  });

  it('keeps a later range in force when an earlier range anchor is cancelled', async () => {
    const uid = 'precedence-daily@corp.test';
    const move = (day: string, hour: string, sequence: number) => [
      `SUMMARY:Report o ${hour}:00`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T${hour}0000Z`,
      `DTEND:202611${day}T${hour}3000Z`,
      'DTSTAMP:20261102T080000Z',
      `SEQUENCE:${String(sequence)}`,
    ];
    await send('Pozvánka: Report', 'REQUEST', uid, [
      'SUMMARY:Report',
      'DTSTART:20261101T090000Z',
      'DTEND:20261101T093000Z',
      'RRULE:FREQ=DAILY',
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:0',
    ]);
    await send('Report o 11:00 od 3.11.', 'REQUEST', uid, move('03', '11', 1));
    await send('Report o 13:00 od 5.11.', 'REQUEST', uid, move('05', '13', 2));
    await send('Zrušené: Report 3.11.', 'CANCEL', uid, [
      'RECURRENCE-ID:20261103T090000Z',
      'DTSTAMP:20261102T090000Z',
      'SEQUENCE:3',
    ]);

    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));

    const { items } = expectOk(
      await harness.bridge.invoke('local.calendar.occurrences', {
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-08T00:00:00Z',
        timeZone: 'UTC',
      }),
    );
    expect(items.map((item) => [item.start, item.title])).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-04T11:00:00.000Z', 'Report o 11:00'],
      ['2026-11-05T13:00:00.000Z', 'Report o 13:00'],
      ['2026-11-06T13:00:00.000Z', 'Report o 13:00'],
      ['2026-11-07T13:00:00.000Z', 'Report o 13:00'],
    ]);
    expect(
      (await seriesOf(account.id, uid)).find((row) => row.status === 'cancelled'),
    ).toMatchObject({
      sequence: 3,
      rangeRevision: { sequence: 1 },
    });
  });
});

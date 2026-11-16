import type { AccountId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const WINDOW = { from: '2026-11-01T00:00:00Z', to: '2026-11-14T00:00:00Z', timeZone: 'UTC' };

const daily = (sequence: number, rule: string) => [
  'SUMMARY:Report',
  'DTSTART:20261101T090000Z',
  'DTEND:20261101T093000Z',
  `RRULE:${rule}`,
  `DTSTAMP:2026110${String(sequence)}T070000Z`,
  `SEQUENCE:${String(sequence)}`,
];

const rangeFrom = (day: string, hour: string) => [
  `SUMMARY:Report o ${hour}:00`,
  `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
  `DTSTART:202611${day}T${hour}0000Z`,
  `DTEND:202611${day}T${hour}3000Z`,
  'DTSTAMP:20261101T080000Z',
  'SEQUENCE:1',
];

const moved = (day: string, sequence = 1, stamp = '20261101T090000Z') => [
  'SUMMARY:Report presunutý',
  `RECURRENCE-ID:202611${day}T090000Z`,
  `DTSTART:202611${day}T150000Z`,
  `DTEND:202611${day}T153000Z`,
  `DTSTAMP:${stamp}`,
  `SEQUENCE:${String(sequence)}`,
];

const cancelDay = (day: string) => [
  `RECURRENCE-ID:202611${day}T090000Z`,
  `DTSTART:202611${day}T090000Z`,
  `DTEND:202611${day}T093000Z`,
  'DTSTAMP:20261102T080000Z',
  'SEQUENCE:1',
];

const cancelAll = ['DTSTAMP:20261102T080000Z', 'SEQUENCE:2'];

const cutFrom = (day: string) => [
  `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
  'DTSTAMP:20261102T080000Z',
  'SEQUENCE:2',
];

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode series restored by a newer master (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let me: GreenMailAccount;
  let organizer: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    me = await createGreenMailAccount();
    organizer = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await organizer.remove();
    await me.remove();
    await dir.remove();
  });

  const send = (uid: string, method: string, lines: readonly string[]) => {
    const ics = [
      'BEGIN:VCALENDAR',
      `METHOD:${method}`,
      'PRODID:-//Relay//Series Restore//EN',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `ORGANIZER;CN=Lucia:mailto:${organizer.email}`,
      `ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${me.email}`,
      `UID:${uid}`,
      ...lines,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    return deliverMail(me, {
      from: `Lucia <${organizer.email}>`,
      subject: `${method} ${uid} ${lines.find((line) => line.startsWith('RECURRENCE-ID')) ?? ''}`,
      text: 'Zmena v sérii.',
      attachments: [
        {
          filename: 'invite.ics',
          contentType: `text/calendar; method=${method}`,
          content: Buffer.from(ics),
        },
      ],
    });
  };

  const deliverAll = async (
    messages: readonly (readonly [string, string, readonly string[]])[],
  ) => {
    for (const [uid, method, lines] of messages) {
      await send(uid, method, lines);
    }
    await expect
      .poll(async () => (await subjectsIn(me, 'INBOX')).length, { timeout: 10_000 })
      .toBe(messages.length);
    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    expect(
      await harness.runtime.engine.repositories.pendingWork.list(account.id, 'calendar-invite'),
    ).toEqual([]);
    return account.id;
  };

  const occurrences = async () =>
    expectOk(await harness.bridge.invoke('local.calendar.occurrences', WINDOW))
      .items.map(
        (item) => `${item.uid.split('-')[0] ?? ''} ${item.start.slice(5, 16)} ${item.title}`,
      )
      .sort();

  const masterOf = async (accountId: AccountId, uid: string) =>
    (
      await harness.runtime.engine.repositories.calendarEvents.findSeries(
        { kind: 'invite', accountId },
        uid,
      )
    ).find((row) => row.recurrenceId === null);

  it('brings back what a whole-series CANCEL and a cut hid once a newer master arrives', async () => {
    const accountId = await deliverAll([
      ['restored-daily@corp.test', 'REQUEST', daily(0, 'FREQ=DAILY;COUNT=10')],
      ['restored-daily@corp.test', 'REQUEST', rangeFrom('03', '11')],
      ['restored-daily@corp.test', 'REQUEST', moved('06')],
      ['restored-daily@corp.test', 'CANCEL', cancelDay('07')],
      ['restored-daily@corp.test', 'CANCEL', cancelAll],
      ['restored-daily@corp.test', 'REQUEST', daily(3, 'FREQ=DAILY;COUNT=10')],
      ['extended-daily@corp.test', 'REQUEST', daily(0, 'FREQ=DAILY;COUNT=10')],
      ['extended-daily@corp.test', 'CANCEL', cutFrom('05')],
      ['extended-daily@corp.test', 'REQUEST', rangeFrom('05', '13')],
      ['extended-daily@corp.test', 'REQUEST', moved('08')],
      ['extended-daily@corp.test', 'REQUEST', daily(3, 'FREQ=DAILY;COUNT=12')],
    ]);

    expect(await occurrences()).toEqual([
      'extended 11-01T09:00 Report',
      'extended 11-02T09:00 Report',
      'extended 11-03T09:00 Report',
      'extended 11-04T09:00 Report',
      'extended 11-05T13:00 Report o 13:00',
      'extended 11-06T13:00 Report o 13:00',
      'extended 11-07T13:00 Report o 13:00',
      'extended 11-08T15:00 Report presunutý',
      'extended 11-09T13:00 Report o 13:00',
      'extended 11-10T13:00 Report o 13:00',
      'extended 11-11T13:00 Report o 13:00',
      'extended 11-12T13:00 Report o 13:00',
      'restored 11-01T09:00 Report',
      'restored 11-02T09:00 Report',
      'restored 11-03T11:00 Report o 11:00',
      'restored 11-04T11:00 Report o 11:00',
      'restored 11-05T11:00 Report o 11:00',
      'restored 11-06T15:00 Report presunutý',
      'restored 11-08T11:00 Report o 11:00',
      'restored 11-09T11:00 Report o 11:00',
      'restored 11-10T11:00 Report o 11:00',
    ]);
    expect((await masterOf(accountId, 'extended-daily@corp.test'))?.rangeEndsAt).toBe(
      '2026-11-13T13:30:00.000Z',
    );
  });

  it('hides older overrides beyond a shortened series and keeps re-sent ones', async () => {
    await deliverAll([
      ['shortened-daily@corp.test', 'REQUEST', daily(0, 'FREQ=DAILY;COUNT=10')],
      ['shortened-daily@corp.test', 'REQUEST', moved('04')],
      ['shortened-daily@corp.test', 'REQUEST', moved('07')],
      ['shortened-daily@corp.test', 'REQUEST', daily(2, 'FREQ=DAILY;UNTIL=20261105T235959Z')],
      ['shortened-daily@corp.test', 'REQUEST', moved('08', 3, '20261106T080000Z')],
    ]);

    expect(await occurrences()).toEqual([
      'shortened 11-01T09:00 Report',
      'shortened 11-02T09:00 Report',
      'shortened 11-03T09:00 Report',
      'shortened 11-04T15:00 Report presunutý',
      'shortened 11-05T09:00 Report',
      'shortened 11-08T15:00 Report presunutý',
    ]);
  });

  it('shows the next derived occurrence of a sparse range whose anchor alone is cancelled', async () => {
    const uid = 'biennial-review@corp.test';
    const accountId = await deliverAll([
      [
        uid,
        'REQUEST',
        [
          'SUMMARY:Audit',
          'DTSTART:20261101T090000Z',
          'DTEND:20261101T100000Z',
          'RRULE:FREQ=YEARLY;INTERVAL=2',
          'DTSTAMP:20261101T070000Z',
          'SEQUENCE:0',
        ],
      ],
      [
        uid,
        'REQUEST',
        [
          'SUMMARY:Audit o 10:00',
          'RECURRENCE-ID;RANGE=THISANDFUTURE:20281101T090000Z',
          'DTSTART:20281101T100000Z',
          'DTEND:20281101T110000Z',
          'DTSTAMP:20261102T070000Z',
          'SEQUENCE:1',
        ],
      ],
      [
        uid,
        'CANCEL',
        [
          'RECURRENCE-ID:20281101T090000Z',
          'DTSTART:20281101T090000Z',
          'DTEND:20281101T100000Z',
          'DTSTAMP:20261103T070000Z',
          'SEQUENCE:2',
        ],
      ],
    ]);
    const range = (
      await harness.runtime.engine.repositories.calendarEvents.findSeries(
        { kind: 'invite', accountId },
        uid,
      )
    ).find((row) => row.thisAndFuture === true);
    const cards = expectOk(
      await harness.bridge.invoke('local.calendar.invitations', {
        threadId: range?.threadId ?? '',
        timeZone: 'UTC',
      }),
    );

    expect(cards.find((card) => card.eventId === range?.id)).toMatchObject({
      status: 'confirmed',
      canRespond: true,
      start: '2030-11-01T10:00:00.000Z',
      end: '2030-11-01T11:00:00.000Z',
    });
  });
});

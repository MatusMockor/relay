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

const daily = (sequence: number, stamp: string) => [
  'SUMMARY:Report',
  'DTSTART:20261101T090000Z',
  'DTEND:20261101T093000Z',
  'RRULE:FREQ=DAILY;COUNT=7',
  `DTSTAMP:${stamp}`,
  `SEQUENCE:${String(sequence)}`,
];

const moved = (day: string, stamp = '20261101T090000Z') => [
  'SUMMARY:Report presunutý',
  `RECURRENCE-ID:202611${day}T090000Z`,
  `DTSTART:202611${day}T150000Z`,
  `DTEND:202611${day}T153000Z`,
  `DTSTAMP:${stamp}`,
  'SEQUENCE:1',
];

const cancelAll = ['DTSTAMP:20261102T080000Z', 'SEQUENCE:2', 'STATUS:CANCELLED'];

const cancelDay = (day: string) => [
  `RECURRENCE-ID:202611${day}T090000Z`,
  'DTSTAMP:20261102T080000Z',
  'SEQUENCE:1',
];

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode cancellations without a master row or DTSTART (SQLite + GreenMail)', () => {
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

  it('hides instances under a whole-series CANCEL until a newer master arrives', async () => {
    await deliverAll([
      ['tomb-daily@corp.test', 'REQUEST', moved('03')],
      ['tomb-daily@corp.test', 'REQUEST', moved('05')],
      ['tomb-daily@corp.test', 'CANCEL', cancelAll],
      ['tomb-daily@corp.test', 'REQUEST', moved('06', '20261102T090000Z')],
      ['back-daily@corp.test', 'REQUEST', moved('03')],
      ['back-daily@corp.test', 'REQUEST', moved('05')],
      ['back-daily@corp.test', 'CANCEL', cancelAll],
      ['back-daily@corp.test', 'REQUEST', daily(3, '20261103T070000Z')],
    ]);

    expect(await occurrences()).toEqual([
      'back 11-01T09:00 Report',
      'back 11-02T09:00 Report',
      'back 11-03T15:00 Report presunutý',
      'back 11-04T09:00 Report',
      'back 11-05T15:00 Report presunutý',
      'back 11-06T09:00 Report',
      'back 11-07T09:00 Report',
      'tomb 11-06T15:00 Report presunutý',
    ]);
  });

  it('cancels an instance named only by its RECURRENCE-ID before and after the series', async () => {
    await deliverAll([
      ['after-daily@corp.test', 'REQUEST', daily(0, '20261101T070000Z')],
      ['after-daily@corp.test', 'CANCEL', cancelDay('04')],
      ['before-daily@corp.test', 'CANCEL', cancelDay('04')],
      ['before-daily@corp.test', 'REQUEST', daily(0, '20261101T070000Z')],
    ]);
    const days = ['01', '02', '03', '05', '06', '07'];

    expect(await occurrences()).toEqual(
      ['after', 'before'].flatMap((name) => days.map((day) => `${name} 11-${day}T09:00 Report`)),
    );
  });
});

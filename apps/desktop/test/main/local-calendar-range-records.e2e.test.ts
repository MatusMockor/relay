import type { AccountId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const WEEK = { from: '2026-11-01T00:00:00Z', to: '2026-11-06T00:00:00Z', timeZone: 'UTC' };

const DAILY = [
  'SUMMARY:Report',
  'DTSTART:20261101T090000Z',
  'DTEND:20261101T093000Z',
  'RRULE:FREQ=DAILY',
  'DTSTAMP:20261101T080000Z',
  'SEQUENCE:0',
];

const rangeAt11 = (sequence: number) => [
  'SUMMARY:Report o 11:00',
  'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z',
  'DTSTART:20261103T110000Z',
  'DTEND:20261103T113000Z',
  'DTSTAMP:20261102T080000Z',
  `SEQUENCE:${String(sequence)}`,
];

const movedOnce = (sequence: number) => [
  'SUMMARY:Report presunutý',
  'RECURRENCE-ID:20261103T090000Z',
  'DTSTART:20261103T150000Z',
  'DTEND:20261103T153000Z',
  'DTSTAMP:20261102T100000Z',
  `SEQUENCE:${String(sequence)}`,
];

const cancelAt3 = (range: string, sequence: number) => [
  `RECURRENCE-ID${range}:20261103T090000Z`,
  'DTSTAMP:20261102T090000Z',
  `SEQUENCE:${String(sequence)}`,
];

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const sourcesIn = (account: GreenMailAccount): Promise<string[]> =>
  withImap(account, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const sources: string[] = [];
      for await (const message of client.fetch('1:*', { source: true })) {
        sources.push(message.source?.toString('utf8') ?? '');
      }
      return sources;
    } finally {
      lock.release();
    }
  });

describe('local mode THISANDFUTURE records next to exact instances (SQLite + GreenMail)', () => {
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

  const send = (subject: string, method: string, uid: string, lines: readonly string[]) => {
    const ics = [
      'BEGIN:VCALENDAR',
      `METHOD:${method}`,
      'PRODID:-//Relay//Range Records//EN',
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
      subject,
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

  const connectAndSync = async (messages: number) => {
    await expect
      .poll(async () => (await subjectsIn(me, 'INBOX')).length, { timeout: 10_000 })
      .toBe(messages);
    const account = expectOk(
      await harness.bridge.invoke('local.accounts.create', imapAccountBody(me)),
    );
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    expect(
      await harness.runtime.engine.repositories.pendingWork.list(account.id, 'calendar-invite'),
    ).toEqual([]);
    return account;
  };

  const seriesOf = (accountId: AccountId, uid: string) =>
    harness.runtime.engine.repositories.calendarEvents.findSeries(
      { kind: 'invite', accountId },
      uid,
    );

  it('restores only the instance re-sent at a cut and changes only the anchor of a range', async () => {
    await send('Pozvánka: Report A', 'REQUEST', 'cut-daily@corp.test', DAILY);
    await send(
      'Zrušené od 3.11.',
      'CANCEL',
      'cut-daily@corp.test',
      cancelAt3(';RANGE=THISANDFUTURE', 1),
    );
    await send('Report A 3.11. znova', 'REQUEST', 'cut-daily@corp.test', movedOnce(2));
    await send('Pozvánka: Report B', 'REQUEST', 'anchor-daily@corp.test', DAILY);
    await send('Report B o 11:00', 'REQUEST', 'anchor-daily@corp.test', rangeAt11(1));
    await send('Report B 3.11. inak', 'REQUEST', 'anchor-daily@corp.test', movedOnce(2));

    const account = await connectAndSync(6);

    const { items } = expectOk(await harness.bridge.invoke('local.calendar.occurrences', WEEK));
    expect(
      items.map((item) => `${item.start} ${item.uid.split('-')[0] ?? ''} ${item.title}`).sort(),
    ).toEqual([
      '2026-11-01T09:00:00.000Z anchor Report',
      '2026-11-01T09:00:00.000Z cut Report',
      '2026-11-02T09:00:00.000Z anchor Report',
      '2026-11-02T09:00:00.000Z cut Report',
      '2026-11-03T15:00:00.000Z anchor Report presunutý',
      '2026-11-03T15:00:00.000Z cut Report presunutý',
      '2026-11-04T11:00:00.000Z anchor Report o 11:00',
      '2026-11-05T11:00:00.000Z anchor Report o 11:00',
    ]);
    const anchorRows = await seriesOf(account.id, 'anchor-daily@corp.test');
    expect(anchorRows.map((row) => [row.thisAndFuture, row.summary, row.sequence])).toEqual([
      [undefined, 'Report', 0],
      [undefined, 'Report presunutý', 2],
      [true, 'Report o 11:00', 1],
    ]);
  });

  it('answers a later day of a range whose anchor alone is cancelled', async () => {
    const uid = 'rsvp-daily@corp.test';
    await send('Pozvánka: Report', 'REQUEST', uid, DAILY);
    await send('Report o 11:00', 'REQUEST', uid, rangeAt11(1));
    await send('Zrušené 3.11.', 'CANCEL', uid, cancelAt3('', 2));
    await connectAndSync(3);

    const { items } = expectOk(await harness.bridge.invoke('local.calendar.occurrences', WEEK));
    const derived = items.find((item) => item.start === '2026-11-04T11:00:00.000Z');
    expect(items.some((item) => item.start.startsWith('2026-11-03'))).toBe(false);
    const answered = expectOk(
      await harness.bridge.invoke('local.calendar.rsvp', {
        eventId: derived?.eventId ?? '',
        response: 'accepted',
        timeZone: 'UTC',
      }),
    );

    expect(answered).toMatchObject({
      canRespond: true,
      myStatus: 'accepted',
      start: '2026-11-04T11:00:00.000Z',
      end: '2026-11-04T11:30:00.000Z',
    });
    await expect
      .poll(() => subjectsIn(organizer, 'INBOX'), { timeout: 10_000 })
      .toEqual(['Prijaté: Report o 11:00']);
    const [reply] = await sourcesIn(organizer);
    expect(reply).toContain('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z');
    expect(reply).toContain('SEQUENCE:1');
  });
});

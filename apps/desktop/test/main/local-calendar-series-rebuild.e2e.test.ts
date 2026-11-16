import type { StoredCalendarEvent } from '@relay/engine';
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
const REPLIED_AT = '2026-11-02T12:00:00.000Z';

const daily = [
  'SUMMARY:Report',
  'DTSTART:20261101T090000Z',
  'DTEND:20261101T093000Z',
  'RRULE:FREQ=DAILY;COUNT=5',
  'DTSTAMP:20261101T070000Z',
  'SEQUENCE:0',
];

const moved = [
  'SUMMARY:Report presunutý',
  'RECURRENCE-ID:20261103T090000Z',
  'DTSTART:20261103T150000Z',
  'DTEND:20261103T153000Z',
  'DTSTAMP:20261101T090000Z',
  'SEQUENCE:1',
];

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode one-time rebuild of invitation series (SQLite + GreenMail)', () => {
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

  it('restores rows an older version overwrote and keeps the local answer', async () => {
    const uid = 'rebuild-daily@corp.test';
    const accountId = await deliverAll([
      [uid, 'REQUEST', daily],
      [uid, 'REQUEST', moved],
    ]);
    const { repositories } = harness.runtime.engine;
    const source = { kind: 'invite', accountId } as const;
    const before = await repositories.calendarEvents.findSeries(source, uid);
    const master = before.find((row) => row.recurrenceId === null) as StoredCalendarEvent;
    const instance = before.find((row) => row.recurrenceId !== null) as StoredCalendarEvent;
    await repositories.calendarEvents.saveIfCurrent({ ...master, messageId: instance.messageId });
    await repositories.calendarEvents.saveIfCurrent({
      ...instance,
      status: 'cancelled',
      method: 'CANCEL',
      sequence: 2,
      myPartstat: 'accepted',
      attendees: instance.attendees.map((attendee) =>
        attendee.email === me.email
          ? { ...attendee, partstat: 'accepted', repliedAt: REPLIED_AT }
          : attendee,
      ),
    });
    for (const mailbox of await repositories.mailboxes.listForSync(accountId)) {
      await repositories.pendingWork.put({
        accountId,
        kind: 'calendar-rebuild',
        ref: mailbox.id,
        payload: { mailboxId: mailbox.id, afterUid: 0 },
        createdAt: new Date().toISOString(),
      });
    }

    expectOk(await harness.bridge.invoke('local.sync.now', { accountId }));

    expect(await repositories.pendingWork.list(accountId, 'calendar-rebuild')).toEqual([]);
    expect(await repositories.pendingWork.list(accountId, 'calendar-rebuild-part')).toEqual([]);
    const after = await repositories.calendarEvents.findSeries(source, uid);
    expect(after.find((row) => row.recurrenceId === null)).toMatchObject({
      id: master.id,
      messageId: master.messageId,
    });
    const restored = after.find((row) => row.id === instance.id);
    expect(restored).toMatchObject({ status: 'confirmed', sequence: 1, myPartstat: 'accepted' });
    expect(restored?.attendees.find((attendee) => attendee.email === me.email)).toMatchObject({
      partstat: 'accepted',
      repliedAt: REPLIED_AT,
    });
    expect(await occurrences()).toContain('rebuild 11-03T15:00 Report presunutý');
  });
});

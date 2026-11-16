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

const ZONE = 'Europe/Bratislava';
const DAY = { from: '2026-11-16T00:00:00+01:00', to: '2026-11-17T00:00:00+01:00', timeZone: ZONE };

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const outlookInvite = (organizer: string, attendee: string): string =>
  [
    'BEGIN:VCALENDAR',
    'METHOD:REQUEST',
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    'BEGIN:VTIMEZONE',
    'TZID:Central Europe Standard Time',
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
    'BEGIN:VEVENT',
    `ORGANIZER;CN=Lucia Horváthová:mailto:${organizer}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    'UID:040000008200E00074C5B7101A82E0080000000010000000E3D4A7B0C7E14E4AA2F4A8C2',
    'SUMMARY;LANGUAGE=sk-SK:1:1 s Luciou',
    'DTSTART;TZID=Central Europe Standard Time:20261116T160000',
    'DTEND;TZID=Central Europe Standard Time:20261116T163000',
    'DTSTAMP:20261114T120000Z',
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'LOCATION;LANGUAGE=sk-SK:Zasadačka Váh',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

describe('local mode calendar (SQLite + GreenMail)', () => {
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
    await me.remove();
    await organizer.remove();
    await dir.remove();
  });

  it('stores an Outlook invitation during sync and answers it over SMTP', async () => {
    const { bridge } = harness;
    await deliverMail(me, {
      from: `Lucia <${organizer.email}>`,
      subject: 'Pozvánka: 1:1 s Luciou',
      text: 'Stretneme sa?',
      attachments: [
        {
          filename: 'invite.ics',
          contentType: 'text/calendar; method=REQUEST',
          content: Buffer.from(outlookInvite(organizer.email, me.email)),
        },
      ],
    });
    const account = expectOk(await bridge.invoke('local.accounts.create', imapAccountBody(me)));
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const { items } = expectOk(await bridge.invoke('local.calendar.occurrences', DAY));
    expect(items).toEqual([
      expect.objectContaining({
        title: '1:1 s Luciou',
        start: '2026-11-16T15:00:00.000Z',
        end: '2026-11-16T15:30:00.000Z',
        location: 'Zasadačka Váh',
        color: account.color,
      }),
    ]);
    const threadId = items[0]?.threadId ?? null;
    expect(threadId).not.toBeNull();
    const [invitation] = expectOk(
      await bridge.invoke('local.calendar.invitations', {
        threadId: threadId ?? '',
        timeZone: ZONE,
      }),
    );
    expect(invitation).toMatchObject({ canRespond: true, myStatus: 'needs-action' });

    const answered = expectOk(
      await bridge.invoke('local.calendar.rsvp', {
        eventId: invitation?.eventId ?? '',
        response: 'tentative',
        timeZone: ZONE,
      }),
    );
    expect(answered.myStatus).toBe('tentative');
    await expect
      .poll(() => subjectsIn(organizer, 'INBOX'), { timeout: 10_000 })
      .toEqual(['Možno: 1:1 s Luciou']);
    expect(harness.events.some((event) => event.type === 'calendar.updated')).toBe(true);
  });
});

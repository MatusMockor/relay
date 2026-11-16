import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { IcalCalendarParser } from '@relay/calendar';
import { type CalendarEventRepository, PORT_TOKENS } from '@relay/engine';
import { MailparserMessageParser } from '@relay/mail-core';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { waitForInvites } from './support/invite-settle';
import { type SeriesMessage, type SeriesParties, seriesMail } from './support/series-mail';

const DAILY: SeriesMessage = {
  method: 'REQUEST',
  subject: 'Pozvánka: Report',
  lines: [
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    'SUMMARY:Report',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T093000Z',
    'RRULE:FREQ=DAILY',
  ],
};

const rangeAt11 = (sequence: number): SeriesMessage => ({
  method: 'REQUEST',
  subject: 'Report o 11:00 od 3.11.',
  lines: [
    'DTSTAMP:20261102T080000Z',
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Report o 11:00',
    'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z',
    'DTSTART:20261103T110000Z',
    'DTEND:20261103T113000Z',
  ],
});

const movedOnce = (sequence: number): SeriesMessage => ({
  method: 'REQUEST',
  subject: 'Presunuté 3.11.',
  lines: [
    'DTSTAMP:20261102T100000Z',
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Report presunutý',
    'RECURRENCE-ID:20261103T090000Z',
    'DTSTART:20261103T150000Z',
    'DTEND:20261103T153000Z',
  ],
});

const cancelAt3 = (range: string, sequence: number): SeriesMessage => ({
  method: 'CANCEL',
  subject: `Zrušené 3.11.${range}`,
  lines: [
    'DTSTAMP:20261102T090000Z',
    `SEQUENCE:${String(sequence)}`,
    `RECURRENCE-ID${range}:20261103T090000Z`,
  ],
});

const WEEK = { from: '2026-11-01T00:00:00Z', to: '2026-11-06T00:00:00Z', timeZone: 'UTC' };

const readInbox = async (client: ImapFlow): Promise<string[]> => {
  const lock = await client.getMailboxLock('INBOX');
  try {
    if (client.mailbox === false || client.mailbox.exists === 0) {
      return [];
    }
    const sources: string[] = [];
    for await (const message of client.fetch('1:*', { source: true })) {
      sources.push(message.source?.toString('utf8') ?? '');
    }
    return sources;
  } finally {
    lock.release();
  }
};

describe('THISANDFUTURE records next to exact instances over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let organizer: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    organizer = await createGreenMailUser('recorg');
  });

  beforeEach(async () => {
    owner = await createGreenMailUser('records');
  });

  afterEach(async () => {
    await deleteGreenMailUser(owner);
  });

  afterAll(async () => {
    await deleteGreenMailUser(organizer);
    await app.close();
  });

  const parties = (name: string): SeriesParties => ({
    uid: `${name}-${randomUUID()}@records.test`,
    organizer: organizer.email,
    attendee: owner.email,
  });

  const seed = async (messages: readonly (readonly [SeriesParties, SeriesMessage])[]) => {
    const session = await registerUser(app.api, `rec-${randomUUID().slice(0, 8)}@relay.test`);
    const client = await openImap(owner);
    for (const [series, message] of messages) {
      await client.append('INBOX', await seriesMail(series, message));
    }
    await client.logout();
    const account = await addImapAccount(app.api, session.accessToken, owner);
    await waitForInvites(app, session.accessToken, account.id, messages.length);
    return { token: session.accessToken, accountId: account.id };
  };

  const occurrences = async (token: string) =>
    (await app.api.ok(api.calendar.occurrences, { query: WEEK }, token)).items
      .map((item) => [item.uid.split('-')[0], item.start, item.title])
      .sort((a, b) => `${a[1] ?? ''}${a[0] ?? ''}`.localeCompare(`${b[1] ?? ''}${b[0] ?? ''}`));

  const seriesOf = (accountId: AccountId, uid: string) =>
    app.app
      .get<symbol, CalendarEventRepository>(PORT_TOKENS.CalendarEventRepository)
      .findSeries({ kind: 'invite', accountId }, uid);

  it('restores only the instance re-sent at a cut and changes only the anchor of a range', async () => {
    const cut = parties('cut');
    const anchor = parties('anchor');
    const { token, accountId } = await seed([
      [cut, DAILY],
      [cut, cancelAt3(';RANGE=THISANDFUTURE', 1)],
      [cut, movedOnce(2)],
      [anchor, DAILY],
      [anchor, rangeAt11(1)],
      [anchor, movedOnce(2)],
    ]);

    expect(await occurrences(token)).toEqual([
      ['anchor', '2026-11-01T09:00:00.000Z', 'Report'],
      ['cut', '2026-11-01T09:00:00.000Z', 'Report'],
      ['anchor', '2026-11-02T09:00:00.000Z', 'Report'],
      ['cut', '2026-11-02T09:00:00.000Z', 'Report'],
      ['anchor', '2026-11-03T15:00:00.000Z', 'Report presunutý'],
      ['cut', '2026-11-03T15:00:00.000Z', 'Report presunutý'],
      ['anchor', '2026-11-04T11:00:00.000Z', 'Report o 11:00'],
      ['anchor', '2026-11-05T11:00:00.000Z', 'Report o 11:00'],
    ]);
    const cutSeries = await seriesOf(accountId, cut.uid);
    expect(cutSeries.map((row) => [row.recurrenceId, row.thisAndFuture, row.status])).toEqual([
      [null, undefined, 'confirmed'],
      ['2026-11-03T09:00:00.000Z', undefined, 'confirmed'],
      ['2026-11-03T09:00:00.000Z', true, 'cancelled'],
    ]);
    expect(cutSeries[0]?.rangeEndsAt).toBe('2026-11-04T09:30:00.000Z');
  });

  it('answers a later day of a range whose anchor alone is cancelled', async () => {
    const series = parties('rsvp');
    const { token } = await seed([
      [series, DAILY],
      [series, rangeAt11(1)],
      [series, cancelAt3('', 2)],
    ]);
    const items = (await app.api.ok(api.calendar.occurrences, { query: WEEK }, token)).items;
    const derived = items.find((item) => item.start === '2026-11-04T11:00:00.000Z');
    expect(items.some((item) => item.start.startsWith('2026-11-03'))).toBe(false);
    expect(derived).toMatchObject({ title: 'Report o 11:00', status: 'confirmed' });

    const answered = await app.api.ok(
      api.calendar.rsvp,
      {
        params: { id: derived?.eventId ?? '' },
        body: { response: 'accepted', timeZone: 'UTC' },
      },
      token,
    );

    expect(answered).toMatchObject({ canRespond: true, myStatus: 'accepted' });
    const inbox = await openImap(organizer);
    let replies: string[] = [];
    await expect
      .poll(
        async () => {
          replies = await readInbox(inbox);
          return replies.length;
        },
        { timeout: 10_000 },
      )
      .toBe(1);
    await inbox.logout();
    const parsed = await new MailparserMessageParser(app.clock).parse(
      new TextEncoder().encode(replies[0] ?? ''),
    );
    const reply = parsed.calendarParts?.[0] ?? '';
    expect(reply).toContain('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z');
    expect(new IcalCalendarParser().parse(reply)?.events[0]).toMatchObject({
      uid: series.uid,
      recurrenceId: '2026-11-03T09:00:00.000Z',
      thisAndFuture: true,
      sequence: 1,
      attendees: [{ email: owner.email, partstat: 'accepted' }],
    });
  });
});

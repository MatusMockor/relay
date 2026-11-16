import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type CalendarEventRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { waitForInvites } from './support/invite-settle';
import { type SeriesMessage, type SeriesParties, seriesMail } from './support/series-mail';

const WINDOW = { from: '2026-11-01T00:00:00Z', to: '2026-11-14T00:00:00Z', timeZone: 'UTC' };

const daily = (sequence: number, rule: string): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Pozvánka: Report v${String(sequence)}`,
  lines: [
    `DTSTAMP:2026110${String(sequence)}T070000Z`,
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Report',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T093000Z',
    `RRULE:${rule}`,
  ],
});

const rangeFrom = (day: string, hour: string): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Report o ${hour}:00 od ${day}.11.`,
  lines: [
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:1',
    `SUMMARY:Report o ${hour}:00`,
    `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
    `DTSTART:202611${day}T${hour}0000Z`,
    `DTEND:202611${day}T${hour}3000Z`,
  ],
});

const moved = (day: string, sequence = 1, stamp = '20261101T090000Z'): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Presunuté ${day}.11.`,
  lines: [
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Report presunutý',
    `RECURRENCE-ID:202611${day}T090000Z`,
    `DTSTART:202611${day}T150000Z`,
    `DTEND:202611${day}T153000Z`,
  ],
});

const cancel = (recurrenceId: string | null, sequence: number): SeriesMessage => ({
  method: 'CANCEL',
  subject: `Zrušené ${recurrenceId ?? 'všetko'}`,
  lines: [
    'DTSTAMP:20261102T080000Z',
    `SEQUENCE:${String(sequence)}`,
    ...(recurrenceId === null ? [] : [recurrenceId]),
  ],
});

const cancelDay = (day: string): SeriesMessage => ({
  method: 'CANCEL',
  subject: `Zrušené ${day}.11.`,
  lines: [
    'DTSTAMP:20261102T080000Z',
    'SEQUENCE:1',
    `RECURRENCE-ID:202611${day}T090000Z`,
    `DTSTART:202611${day}T090000Z`,
    `DTEND:202611${day}T093000Z`,
  ],
});

describe('series restored by a newer master over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  beforeEach(async () => {
    owner = await createGreenMailUser('restore');
  });

  afterEach(async () => {
    await deleteGreenMailUser(owner);
  });

  afterAll(async () => {
    await app.close();
  });

  const parties = (name: string): SeriesParties => ({
    uid: `${name}-${randomUUID()}@restore.test`,
    organizer: 'peter@partner.test',
    attendee: owner.email,
  });

  const seed = async (messages: readonly (readonly [SeriesParties, SeriesMessage])[]) => {
    const session = await registerUser(app.api, `res-${randomUUID().slice(0, 8)}@relay.test`);
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
    (await app.api.ok(api.calendar.occurrences, { query: WINDOW }, token)).items
      .map((item) => `${item.uid.split('-')[0] ?? ''} ${item.start.slice(5, 16)} ${item.title}`)
      .sort();

  const masterOf = async (accountId: AccountId, uid: string) =>
    (
      await app.app
        .get<symbol, CalendarEventRepository>(PORT_TOKENS.CalendarEventRepository)
        .findSeries({ kind: 'invite', accountId }, uid)
    ).find((row) => row.recurrenceId === null);

  it('brings back range records and overrides after a whole-series CANCEL', async () => {
    const restored = parties('restored');
    const gone = parties('gone');
    const records = (series: SeriesParties) =>
      [
        [series, daily(0, 'FREQ=DAILY;COUNT=10')],
        [series, rangeFrom('03', '11')],
        [series, moved('06')],
        [series, cancelDay('07')],
      ] as const;
    const { token, accountId } = await seed([
      ...records(restored),
      [restored, cancel(null, 2)],
      [restored, daily(3, 'FREQ=DAILY;COUNT=10')],
      ...records(gone),
      [gone, cancel(null, 2)],
    ]);

    expect(await occurrences(token)).toEqual([
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
    expect((await masterOf(accountId, restored.uid))?.rangeEndsAt).toBe('2026-11-11T11:30:00.000Z');
  });

  it('ignores a cut once a newer master extends the series and shows what it hid', async () => {
    const extended = parties('extended');
    const { token, accountId } = await seed([
      [extended, daily(0, 'FREQ=DAILY;COUNT=10')],
      [extended, rangeFrom('03', '11')],
      [extended, cancel('RECURRENCE-ID;RANGE=THISANDFUTURE:20261105T090000Z', 2)],
      [extended, rangeFrom('05', '13')],
      [extended, moved('08')],
      [extended, cancelDay('09')],
      [extended, daily(3, 'FREQ=DAILY;COUNT=12')],
    ]);

    expect(await occurrences(token)).toEqual([
      'extended 11-01T09:00 Report',
      'extended 11-02T09:00 Report',
      'extended 11-03T11:00 Report o 11:00',
      'extended 11-04T11:00 Report o 11:00',
      'extended 11-05T13:00 Report o 13:00',
      'extended 11-06T13:00 Report o 13:00',
      'extended 11-07T13:00 Report o 13:00',
      'extended 11-08T15:00 Report presunutý',
      'extended 11-10T13:00 Report o 13:00',
      'extended 11-11T13:00 Report o 13:00',
      'extended 11-12T13:00 Report o 13:00',
    ]);
    expect((await masterOf(accountId, extended.uid))?.rangeEndsAt).toBe('2026-11-13T13:30:00.000Z');
  });

  it('hides older overrides beyond a shortened series and keeps re-sent ones', async () => {
    const shortened = parties('shortened');
    const { token } = await seed([
      [shortened, daily(0, 'FREQ=DAILY;COUNT=10')],
      [shortened, moved('04')],
      [shortened, moved('07')],
      [shortened, daily(2, 'FREQ=DAILY;UNTIL=20261105T235959Z')],
      [shortened, moved('08', 3, '20261106T080000Z')],
    ]);

    expect(await occurrences(token)).toEqual([
      'shortened 11-01T09:00 Report',
      'shortened 11-02T09:00 Report',
      'shortened 11-03T09:00 Report',
      'shortened 11-04T15:00 Report presunutý',
      'shortened 11-05T09:00 Report',
      'shortened 11-08T15:00 Report presunutý',
    ]);
  });
});

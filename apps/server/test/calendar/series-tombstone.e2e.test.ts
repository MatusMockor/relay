import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type CalendarEventRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { waitForInvites } from './support/invite-settle';
import { type SeriesMessage, type SeriesParties, seriesMail } from './support/series-mail';

const WINDOW = { from: '2026-11-01T00:00:00Z', to: '2026-11-14T00:00:00Z', timeZone: 'UTC' };

const daily = (sequence: number, stamp: string): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Pozvánka: Report v${String(sequence)}`,
  lines: [
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Report',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T093000Z',
    'RRULE:FREQ=DAILY;COUNT=7',
  ],
});

const moved = (day: string, stamp = '20261101T090000Z'): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Presunuté ${day}.11.`,
  lines: [
    `DTSTAMP:${stamp}`,
    'SEQUENCE:1',
    'SUMMARY:Report presunutý',
    `RECURRENCE-ID:202611${day}T090000Z`,
    `DTSTART:202611${day}T150000Z`,
    `DTEND:202611${day}T153000Z`,
  ],
});

const cancelAll: SeriesMessage = {
  method: 'CANCEL',
  subject: 'Zrušená séria',
  lines: ['DTSTAMP:20261102T080000Z', 'SEQUENCE:2', 'STATUS:CANCELLED'],
};

const cancelDay = (day: string): SeriesMessage => ({
  method: 'CANCEL',
  subject: `Zrušené ${day}.11.`,
  lines: ['DTSTAMP:20261102T080000Z', 'SEQUENCE:1', `RECURRENCE-ID:202611${day}T090000Z`],
});

describe('cancellations without a master row or DTSTART over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  beforeEach(async () => {
    owner = await createGreenMailUser('tombstone');
  });

  afterEach(async () => {
    await deleteGreenMailUser(owner);
  });

  afterAll(async () => {
    await app.close();
  });

  const parties = (name: string): SeriesParties => ({
    uid: `${name}-${randomUUID()}@tombstone.test`,
    organizer: 'peter@partner.test',
    attendee: owner.email,
  });

  const occurrencesOf = async (messages: readonly (readonly [SeriesParties, SeriesMessage])[]) => {
    const session = await registerUser(app.api, `tmb-${randomUUID().slice(0, 8)}@relay.test`);
    const client = await openImap(owner);
    for (const [series, message] of messages) {
      await client.append('INBOX', await seriesMail(series, message));
    }
    await client.logout();
    const account = await addImapAccount(app.api, session.accessToken, owner);
    await waitForInvites(app, session.accessToken, account.id, messages.length);
    const shown = (
      await app.api.ok(api.calendar.occurrences, { query: WINDOW }, session.accessToken)
    ).items
      .map((item) => `${item.uid.split('-')[0] ?? ''} ${item.start.slice(5, 16)} ${item.title}`)
      .sort();
    return { shown, accountId: account.id };
  };

  it('hides instances under a whole-series CANCEL until a newer master arrives', async () => {
    const tomb = parties('tomb');
    const back = parties('back');

    const { shown } = await occurrencesOf([
      [tomb, moved('03')],
      [tomb, moved('05')],
      [tomb, cancelAll],
      [tomb, moved('06', '20261102T090000Z')],
      [back, moved('03')],
      [back, moved('05')],
      [back, cancelAll],
      [back, daily(3, '20261103T070000Z')],
    ]);
    expect(shown).toEqual([
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
    const after = parties('after');
    const before = parties('before');
    const days = ['01', '02', '03', '05', '06', '07'];

    const { shown, accountId } = await occurrencesOf([
      [after, daily(0, '20261101T070000Z')],
      [after, cancelDay('04')],
      [before, cancelDay('04')],
      [before, daily(0, '20261101T070000Z')],
    ]);
    expect(shown).toEqual(
      ['after', 'before'].flatMap((name) => days.map((day) => `${name} 11-${day}T09:00 Report`)),
    );
    const events = app.app.get<symbol, CalendarEventRepository>(
      PORT_TOKENS.CalendarEventRepository,
    );
    for (const series of [after, before]) {
      const cancelled = (await events.findSeries({ kind: 'invite', accountId }, series.uid)).find(
        (row) => row.recurrenceId === '2026-11-04T09:00:00.000Z',
      );
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        startsAt: '2026-11-04T09:00:00.000Z',
        endsAt: '2026-11-04T09:30:00.000Z',
      });
    }
  });
});

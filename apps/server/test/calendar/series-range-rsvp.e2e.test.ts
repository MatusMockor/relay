import { randomUUID } from 'node:crypto';
import {
  GOOGLE_CALENDAR_STUB_SCOPES,
  type GoogleCalendarStub,
  type GreenMailUser,
  startGoogleCalendarStub,
} from '@relay/config/test-infra';
import { type CalendarEventRepository, PORT_TOKENS, type StoredCalendarEvent } from '@relay/engine';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import {
  createGreenMailUser,
  deleteGreenMailUser,
  listSubjects,
  openImap,
} from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { ManualClock } from '../support/manual-clock';
import { startTestApp, type TestApp } from '../support/test-app';
import { type SeriesMessage, seriesMail } from './support/series-mail';

const ZONE = 'Europe/Bratislava';
const HIDDEN = '2026-11-30T09:00:00.000Z';

const weekly: SeriesMessage = {
  method: 'REQUEST',
  subject: 'Pozvánka: Porada',
  lines: [
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    'SUMMARY:Porada',
    `DTSTART;TZID=${ZONE}:20261102T100000`,
    `DTEND;TZID=${ZONE}:20261102T110000`,
    'RRULE:FREQ=WEEKLY',
  ],
};

const moved: SeriesMessage = {
  method: 'REQUEST',
  subject: 'Presunuté: Porada 30.11.',
  lines: [
    'DTSTAMP:20261102T080000Z',
    'SEQUENCE:1',
    'SUMMARY:Porada (presunutá)',
    `RECURRENCE-ID;TZID=${ZONE}:20261130T100000`,
    `DTSTART;TZID=${ZONE}:20261130T150000`,
    `DTEND;TZID=${ZONE}:20261130T160000`,
  ],
};

const cut: SeriesMessage = {
  method: 'CANCEL',
  subject: 'Zrušené od 23.11.',
  lines: [
    'DTSTAMP:20261110T080000Z',
    'SEQUENCE:2',
    `RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=${ZONE}:20261123T100000`,
  ],
};

interface Mailboxes {
  readonly owner: GreenMailUser;
  readonly organizer: GreenMailUser;
}

const openMailboxes = async (): Promise<Mailboxes> => ({
  owner: await createGreenMailUser('rsvp'),
  organizer: await createGreenMailUser('org'),
});

const closeMailboxes = async ({ owner, organizer }: Mailboxes): Promise<void> => {
  await deleteGreenMailUser(owner);
  await deleteGreenMailUser(organizer);
};

const repliesTo = async (organizer: GreenMailUser): Promise<string[]> => {
  const client = await openImap(organizer);
  const subjects = await listSubjects(client, 'INBOX');
  await client.logout();
  return subjects;
};

const seedSeries = async (
  app: TestApp,
  token: string,
  mail: Mailboxes,
  uid: string,
): Promise<{ master: StoredCalendarEvent; hidden: StoredCalendarEvent }> => {
  const parties = { uid, organizer: mail.organizer.email, attendee: mail.owner.email };
  const inbox = await openImap(mail.owner);
  for (const message of [weekly, moved, cut]) {
    await inbox.append('INBOX', await seriesMail(parties, message));
  }
  await inbox.logout();
  const account = await addImapAccount(app.api, token, mail.owner);
  const events = app.app.get<symbol, CalendarEventRepository>(PORT_TOKENS.CalendarEventRepository);
  const source = { kind: 'invite' as const, accountId: account.id };
  let series: StoredCalendarEvent[] = [];
  await expect
    .poll(
      async () => {
        series = await events.findSeries(source, uid);
        return series.length;
      },
      { timeout: 20_000, interval: 250 },
    )
    .toBe(3);
  const master = series.find((row) => row.recurrenceId === null);
  const hidden = series.find((row) => row.recurrenceId === HIDDEN);
  expect(hidden).toMatchObject({ status: 'confirmed', method: 'REQUEST' });
  return { master: master as StoredCalendarEvent, hidden: hidden as StoredCalendarEvent };
};

const rsvp = (app: TestApp, token: string, event: StoredCalendarEvent) =>
  app.api.fail(
    api.calendar.rsvp,
    { params: { id: event.id }, body: { response: 'accepted', timeZone: ZONE } },
    token,
  );

describe('RSVP to an override hidden by a THISANDFUTURE cut', () => {
  describe('over iMIP (GreenMail)', () => {
    let app: TestApp;
    let mail: Mailboxes;

    beforeAll(async () => {
      app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
      mail = await openMailboxes();
    });

    afterAll(async () => {
      await closeMailboxes(mail);
      await app.close();
    });

    it('refuses the hidden override and still answers the series', async () => {
      const token = (await registerUser(app.api, `${randomUUID()}@relay.test`)).accessToken;
      const { master, hidden } = await seedSeries(app, token, mail, `${randomUUID()}@range.test`);

      const refused = await rsvp(app, token, hidden);
      expect(refused.status).toBe(400);
      expect(await repliesTo(mail.organizer)).toEqual([]);

      await app.api.ok(
        api.calendar.rsvp,
        { params: { id: master.id }, body: { response: 'accepted', timeZone: ZONE } },
        token,
      );
      await expect
        .poll(() => repliesTo(mail.organizer), { timeout: 10_000 })
        .toEqual(['Prijaté: Porada']);
    });
  });

  describe('through Google first (Google HTTP stub)', () => {
    let app: TestApp;
    let mail: Mailboxes;
    let google: GoogleCalendarStub;

    beforeAll(async () => {
      mail = await openMailboxes();
      google = await startGoogleCalendarStub(mail.owner.email);
      google.grantCode('calendar-code', GOOGLE_CALENDAR_STUB_SCOPES);
      google.calendars.push({
        id: mail.owner.email,
        summary: 'Ja',
        primary: true,
        selected: true,
        accessRole: 'owner',
        timeZone: ZONE,
      });
      app = await startTestApp({
        clock: new ManualClock(new Date('2026-11-15T10:00:00.000Z')),
        env: {
          JOBS_ENABLED: 'true',
          GOOGLE_OAUTH_CLIENT_ID: 'relay-client',
          GOOGLE_OAUTH_CLIENT_SECRET: 'relay-secret',
          GOOGLE_OAUTH_TOKEN_ENDPOINT: google.tokenUrl,
          GOOGLE_CALENDAR_API_URL: google.apiUrl,
        },
      });
    });

    afterAll(async () => {
      await app.close();
      await google.close();
      await closeMailboxes(mail);
    });

    it('refuses the hidden override without calling Google or sending mail', async () => {
      const token = (await registerUser(app.api, `${randomUUID()}@relay.test`)).accessToken;
      const uid = `${randomUUID()}@range.test`;
      google.put(mail.owner.email, {
        id: 'porada',
        iCalUID: uid,
        summary: 'Porada',
        start: { dateTime: '2026-11-02T10:00:00+01:00', timeZone: ZONE },
        end: { dateTime: '2026-11-02T11:00:00+01:00', timeZone: ZONE },
        recurrence: ['RRULE:FREQ=WEEKLY'],
        organizer: { email: mail.organizer.email },
        attendees: [
          { email: mail.organizer.email, organizer: true, responseStatus: 'accepted' },
          { email: mail.owner.email, self: true, responseStatus: 'needsAction' },
        ],
      });
      await app.api.ok(
        api.googleCalendar.connect,
        {
          body: {
            oauth: {
              code: 'calendar-code',
              codeVerifier: 'v'.repeat(43),
              redirectUri: 'http://127.0.0.1:53111/oauth/callback',
            },
          },
        },
        token,
      );
      const { master, hidden } = await seedSeries(app, token, mail, uid);
      const patches = () => google.requests.filter((request) => request.method === 'PATCH');

      const refused = await rsvp(app, token, hidden);
      expect(refused.status).toBe(400);
      expect(patches()).toEqual([]);
      expect(await repliesTo(mail.organizer)).toEqual([]);

      await app.api.ok(
        api.calendar.rsvp,
        { params: { id: master.id }, body: { response: 'accepted', timeZone: ZONE } },
        token,
      );
      expect(patches()).toEqual([
        expect.objectContaining({ path: `calendars/${mail.owner.email}/events/porada` }),
      ]);
      expect(await repliesTo(mail.organizer)).toEqual([]);
    });
  });
});

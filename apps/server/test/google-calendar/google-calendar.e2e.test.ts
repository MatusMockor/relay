import { randomUUID } from 'node:crypto';
import {
  GOOGLE_CALENDAR_STUB_SCOPES,
  type GoogleCalendarStub,
  startGoogleCalendarStub,
} from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { CalendarOccurrence } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { ManualClock } from '../support/manual-clock';
import { startTestApp, type TestApp } from '../support/test-app';

const ZONE = 'Europe/Bratislava';
const DAY = { from: '2026-11-16T00:00:00+01:00', to: '2026-11-17T00:00:00+01:00', timeZone: ZONE };
const EMAIL = 'me@gmail.test';
const grant = (code: string) => ({
  code,
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'http://127.0.0.1:53111/oauth/callback',
});
const at = (hour: number) => `2026-11-16T${String(hour).padStart(2, '0')}:00:00Z`;

describe('Google calendar over the server', () => {
  let app: TestApp;
  let google: GoogleCalendarStub;
  let token: string;

  const occurrences = async (): Promise<CalendarOccurrence[]> =>
    (await app.api.ok(api.calendar.occurrences, { query: DAY }, token)).items;
  const present = <Value>(value: Value | undefined): Value => {
    expect(value).toBeDefined();
    return value as Value;
  };
  const byTitle = async (title: string) =>
    present((await occurrences()).find((entry) => entry.title === title));

  beforeAll(async () => {
    google = await startGoogleCalendarStub(EMAIL);
    google.grantCode('calendar-code', GOOGLE_CALENDAR_STUB_SCOPES);
    google.grantCode('mail-code', 'https://mail.google.com/ openid email');
    google.grantCode('combined-code', `https://mail.google.com/ ${GOOGLE_CALENDAR_STUB_SCOPES}`);
    google.calendars.push(
      {
        id: EMAIL,
        summary: 'Ja',
        primary: true,
        selected: true,
        accessRole: 'owner',
        backgroundColor: '#7986cb',
        timeZone: ZONE,
      },
      { id: 'sviatky@group', summary: 'Sviatky', selected: false, accessRole: 'reader' },
    );
    google.put(EMAIL, {
      id: 'own',
      iCalUID: 'own@google.com',
      summary: 'Vlastná',
      start: { dateTime: at(8) },
      end: { dateTime: at(9) },
      organizer: { email: EMAIL, self: true },
    });
    google.put(EMAIL, {
      id: 'inv',
      iCalUID: 'inv@partner.test',
      summary: 'Pozvánka',
      start: { dateTime: at(10) },
      end: { dateTime: at(11) },
      organizer: { email: 'boss@partner.test' },
      attendees: [
        { email: 'boss@partner.test', organizer: true, responseStatus: 'accepted' },
        { email: EMAIL, self: true, responseStatus: 'needsAction' },
      ],
    });
    app = await startTestApp({
      clock: new ManualClock(new Date('2026-11-15T10:00:00.000Z')),
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'relay-client',
        GOOGLE_OAUTH_CLIENT_SECRET: 'relay-secret',
        GOOGLE_OAUTH_TOKEN_ENDPOINT: google.tokenUrl,
        GOOGLE_CALENDAR_API_URL: google.apiUrl,
      },
    });
    token = (await registerUser(app.api, `${randomUUID()}@relay.test`)).accessToken;
  });

  afterAll(async () => {
    await app.close();
    await google.close();
  });

  it('connects a calendar-only Google account and shows its events', async () => {
    const before = await app.api.ok(api.googleCalendar.overview, {}, token);
    expect(before).toMatchObject({ configured: true, setupHint: null, connections: [] });

    const connection = await app.api.ok(
      api.googleCalendar.connect,
      { body: { oauth: grant('calendar-code') } },
      token,
    );

    expect(connection).toMatchObject({ email: EMAIL, status: 'ok', accountId: null });
    expect(connection.calendars.map((calendar) => [calendar.name, calendar.enabled])).toEqual([
      ['Ja', true],
      ['Sviatky', false],
    ]);
    const shown = await occurrences();
    expect(
      shown.map((entry) => [entry.title, entry.color, entry.canDelete, entry.canRespond]),
    ).toEqual([
      ['Vlastná', '#7986cb', true, false],
      ['Pozvánka', '#7986cb', false, true],
    ]);
  });

  it('refuses a grant without calendar scopes', async () => {
    const failure = await app.api.fail(
      api.googleCalendar.connect,
      { body: { oauth: grant('mail-code') } },
      token,
    );

    expect(failure.status).toBe(400);
    expect(failure.error.message).toContain('kalendáru');
  });

  it('answers an invitation through the API with If-Match', async () => {
    const invitation = await byTitle('Pozvánka');

    await app.api.ok(
      api.googleCalendar.respond,
      { params: { id: invitation.eventId }, body: { response: 'accepted' } },
      token,
    );

    const patch = google.requests.find((request) => request.method === 'PATCH');
    expect(patch).toMatchObject({ path: `calendars/${EMAIL}/events/inv` });
    expect(patch?.ifMatch).toMatch(/^"v\d+"$/);
    const attendees = google.event(EMAIL, 'inv')?.attendees as {
      email: string;
      responseStatus: string;
    }[];
    expect(attendees.find((attendee) => attendee.email === EMAIL)?.responseStatus).toBe('accepted');
    expect((await byTitle('Pozvánka')).myStatus).toBe('accepted');
  });

  it('creates an event and handles an ETag conflict when deleting', async () => {
    const overview = await app.api.ok(api.googleCalendar.overview, {}, token);
    const primary = present(overview.connections[0]?.calendars[0]);
    await app.api.ok(
      api.googleCalendar.createEvent,
      {
        body: {
          calendarId: primary.id,
          title: 'Obed',
          allDay: false,
          start: at(12),
          end: at(13),
          timeZone: ZONE,
          location: 'Bistro',
          attendees: [],
        },
      },
      token,
    );
    expect((await byTitle('Obed')).location).toBe('Bistro');

    const own = await byTitle('Vlastná');
    google.put(EMAIL, { ...(google.event(EMAIL, 'own') ?? { id: 'own' }), summary: 'Vlastná' });
    const conflict = await app.api.fail(
      api.googleCalendar.deleteEvent,
      { params: { id: own.eventId } },
      token,
    );
    expect(conflict.status).toBe(409);
    expect(google.event(EMAIL, 'own')).toBeDefined();

    await app.api.ok(api.googleCalendar.deleteEvent, { params: { id: own.eventId } }, token);
    expect(google.event(EMAIL, 'own')).toBeUndefined();
    expect((await occurrences()).map((entry) => entry.title)).not.toContain('Vlastná');
  });

  it('picks up remote changes on sync and asks to reconnect when Google rejects the token', async () => {
    const overview = await app.api.ok(api.googleCalendar.overview, {}, token);
    const { id } = present(overview.connections[0]);
    google.put(EMAIL, {
      id: 'late',
      iCalUID: 'late@google.com',
      summary: 'Neskorá',
      start: { dateTime: at(15) },
      end: { dateTime: at(16) },
    });

    await app.api.ok(api.googleCalendar.sync, { params: { id } }, token);
    expect((await occurrences()).map((entry) => entry.title)).toContain('Neskorá');
    expect(
      google.requests.some(
        (request) => request.method === 'GET' && request.path.endsWith('/events'),
      ),
    ).toBe(true);

    google.expireAccessTokens();
    const failed = await app.api.ok(api.googleCalendar.sync, { params: { id } }, token);
    expect(failed.status).toBe('reauthorize');
  });

  it('connects the calendar together with a new Gmail account', async () => {
    const other = (await registerUser(app.api, `${randomUUID()}@relay.test`)).accessToken;

    const account = await app.api.ok(
      api.accounts.create,
      { body: { provider: 'gmail', oauth: grant('combined-code') } },
      other,
    );

    const overview = await app.api.ok(api.googleCalendar.overview, {}, other);
    expect(overview.connections).toHaveLength(1);
    expect(overview.connections[0]).toMatchObject({ email: EMAIL, accountId: account.id });
  });
});

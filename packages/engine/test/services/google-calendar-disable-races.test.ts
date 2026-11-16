import type { GoogleCalendarId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { DAY_WINDOW, ORGANIZER } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { ME, present } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PRIMARY = 'alice@example.com';
const ZONE = 'Europe/Bratislava';

const invitation = remoteEvent({
  remoteId: 'inv',
  summary: 'Pozvánka',
  organizer: ORGANIZER,
  myPartstat: 'needs-action',
  attendees: [
    { ...ORGANIZER, partstat: 'accepted', role: null },
    { name: ME.name, email: ME.email, partstat: 'needs-action', role: null },
  ],
});

const connect = async (engine: TestEngine) => {
  engine.google.gateway.calendars.push(remoteCalendar());
  const connection = await engine.services.googleCalendar.connect(USER_ID, {
    email: PRIMARY,
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
  return present(connection.calendars[0]);
};

const disableDuringNextWrite = (engine: TestEngine, calendarId: GoogleCalendarId) => {
  engine.google.gateway.beforeWrite = async () => {
    await engine.services.googleCalendar.updateCalendar(USER_ID, calendarId, {
      enabled: false,
    });
  };
};

const googleRows = (engine: TestEngine) =>
  [...engine.db.tables.calendarEvents.values()].filter((row) => row.source.kind === 'google');

const body = (calendarId: GoogleCalendarId) => ({
  calendarId,
  title: 'Obed',
  allDay: false,
  start: '2026-11-16T11:00:00.000Z',
  end: '2026-11-16T12:00:00.000Z',
  timeZone: ZONE,
  location: '',
  attendees: [],
});

describe('Google writes against a calendar disabled meanwhile', () => {
  it('does not store an RSVP result into a calendar disabled while it was in flight', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, invitation);
    const calendar = await connect(engine);
    const [shown] = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    disableDuringNextWrite(engine, calendar.id);

    await engine.services.googleCalendar.respond(USER_ID, present(shown).eventId, 'accepted');

    expect(engine.google.gateway.writes).toEqual(['rsvp inv accepted']);
    expect(googleRows(engine)).toEqual([]);
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
  });

  it('reports an event created while its calendar was disabled without storing it', async () => {
    const engine = createTestEngine();
    const calendar = await connect(engine);
    disableDuringNextWrite(engine, calendar.id);

    await expect(
      engine.services.googleCalendar.createEvent(USER_ID, body(calendar.id)),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(engine.google.gateway.writes).toEqual(['insert Obed']);
    expect(googleRows(engine)).toEqual([]);
  });

  it('refuses to create an event in a disabled calendar', async () => {
    const engine = createTestEngine();
    const calendar = await connect(engine);
    await engine.services.googleCalendar.updateCalendar(USER_ID, calendar.id, { enabled: false });

    await expect(
      engine.services.googleCalendar.createEvent(USER_ID, body(calendar.id)),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(engine.google.gateway.writes).toEqual([]);
  });

  it('hides events of a disabled calendar from occurrences', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'A' }));
    const calendar = await connect(engine);
    const stored = googleRows(engine);
    await engine.services.googleCalendar.updateCalendar(USER_ID, calendar.id, { enabled: false });
    for (const row of stored) {
      engine.db.tables.calendarEvents.set(row.id, row);
    }

    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
  });

  it('notifies other clients when a Google connection is removed', async () => {
    const engine = createTestEngine();
    await connect(engine);
    const [connection] = (await engine.services.googleCalendar.overview(USER_ID)).connections;
    engine.events.clear();

    await engine.services.googleCalendar.disconnect(USER_ID, present(connection).id);

    expect(engine.events.ofType('calendar.updated')).toMatchObject([
      { data: { sourceKind: 'google', sourceId: present(connection).id } },
    ]);
  });
});

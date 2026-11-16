import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { DAY_WINDOW } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { reauthorizationError } from '../support/fakes/fake-google-calendar';
import { present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PRIMARY = 'alice@example.com';

const connect = async (engine: TestEngine) => {
  engine.google.gateway.calendars.push(
    remoteCalendar(),
    remoteCalendar({ remoteId: 'team@group', name: 'Tím', primary: false, selected: false }),
    remoteCalendar({ remoteId: 'busy@group', name: 'Obsadenosť', accessRole: 'freeBusyReader' }),
  );
  return engine.services.googleCalendar.connect(USER_ID, {
    email: 'Alice@Example.com',
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
};

const titles = async (engine: TestEngine) =>
  (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).map((entry) => entry.title);

describe('Google calendar sync', () => {
  it('connects, stores the tokens and syncs the calendar list with per-calendar defaults', async () => {
    const engine = createTestEngine();
    const gmail = await seedAccount(engine, { provider: 'gmail' });
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'Standup' }));

    const connection = await connect(engine);

    expect(connection).toMatchObject({
      email: 'alice@example.com',
      accountId: gmail.account.id,
      status: 'ok',
    });
    expect(connection.calendars.map((calendar) => [calendar.name, calendar.enabled])).toEqual([
      ['Alice', true],
      ['Tím', false],
    ]);
    expect(connection.calendars[0]?.color).toBe('#039be5');
    expect(engine.google.credentials.stored.get(connection.id)?.refreshToken).toBe('refresh-1');
    expect(await titles(engine)).toEqual(['Standup']);
    const [occurrence] = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrence).toMatchObject({
      sourceKind: 'google',
      googleCalendarId: connection.calendars[0]?.id,
      color: '#039be5',
      canDelete: true,
      canRespond: false,
    });
  });

  it('refuses tokens without the calendar scope', async () => {
    const engine = createTestEngine();

    await expect(
      engine.services.googleCalendar.connect(USER_ID, {
        email: PRIMARY,
        credentials: googleCredentials('https://mail.google.com/ openid email'),
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(engine.db.tables.googleConnections.size).toBe(0);
  });

  it('applies incremental changes with the sync token across pages', async () => {
    const engine = createTestEngine();
    engine.google.gateway.pageSize = 2;
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'A' }));
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'b', summary: 'B' }));
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'c', summary: 'C' }));
    const connection = await connect(engine);
    expect((await titles(engine)).sort()).toEqual(['A', 'B', 'C']);

    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'A2' }));
    engine.google.gateway.cancel(PRIMARY, 'b');
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'd', summary: 'D' }));
    engine.google.gateway.requests.length = 0;
    await engine.services.googleCalendar.sync(USER_ID, connection.id);

    expect((await titles(engine)).sort()).toEqual(['A2', 'C', 'D']);
    const primaryRequests = engine.google.gateway.requests.filter(
      (request) => request.calendarRemoteId === PRIMARY,
    );
    expect(primaryRequests.map((request) => request.pageToken)).toEqual([null, '2']);
    expect(primaryRequests.every((request) => request.syncToken !== null)).toBe(true);
    expect(primaryRequests.every((request) => request.timeMin === null)).toBe(true);
  });

  it('runs a full resync when Google answers 410 Gone for the sync token', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'A' }));
    const connection = await connect(engine);
    engine.google.gateway.events.get(PRIMARY)?.delete('a');
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'z', summary: 'Z' }));
    engine.google.gateway.expireTokens();
    engine.google.gateway.requests.length = 0;

    await engine.services.googleCalendar.sync(USER_ID, connection.id);

    expect(await titles(engine)).toEqual(['Z']);
    const [expired, full] = engine.google.gateway.requests;
    expect(expired?.syncToken).not.toBeNull();
    expect(full).toMatchObject({ syncToken: null, timeMin: '2025-11-15T10:00:00.000Z' });
    const calendar = present(connection.calendars[0]);
    expect(engine.db.tables.googleCalendars.get(calendar.id)?.syncToken).not.toBeNull();
  });

  it('stores a cancelled instance under the master uid even without an iCalUID', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({ remoteId: 'series', uid: 'series@google.com', recurring: true }),
    );
    const connection = await connect(engine);
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({
        remoteId: 'series_20261116T090000Z',
        uid: null,
        recurringRemoteId: 'series',
        recurrenceId: '2026-11-16T09:00:00.000Z',
        status: 'cancelled',
      }),
    );

    await engine.services.googleCalendar.sync(USER_ID, connection.id);

    const rows = [...engine.db.tables.calendarEvents.values()];
    expect(rows.map((row) => [row.uid, row.recurrenceId, row.status])).toEqual([
      ['series@google.com', null, 'confirmed'],
      ['series@google.com', '2026-11-16T09:00:00.000Z', 'cancelled'],
    ]);
  });

  it('shows an email invitation once when the same event exists in Google', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    await engine.repositories.calendarEvents.upsert({
      id: engine.ids.generate('calendarEvent'),
      userId: USER_ID,
      source: { kind: 'invite', accountId: account.id },
      uid: 'shared@partner.test',
      recurrenceId: null,
      sequence: 0,
      dtstamp: null,
      method: 'REQUEST',
      status: 'confirmed',
      summary: 'Z mailu',
      location: null,
      description: null,
      organizer: null,
      attendees: [],
      myPartstat: 'needs-action',
      myEmail: PRIMARY,
      allDay: false,
      startsAt: '2026-11-16T09:00:00.000Z',
      endsAt: '2026-11-16T10:00:00.000Z',
      recurring: false,
      rangeEndsAt: '2026-11-16T10:00:00.000Z',
      ics: 'ICS',
      messageId: null,
      threadId: 'thread_1' as ThreadId,
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
      revision: 0,
    });
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({ remoteId: 'g', uid: 'shared@partner.test', summary: 'Z Googlu' }),
    );

    await connect(engine);

    const occurrences = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrences.map((entry) => [entry.title, entry.sourceKind, entry.threadId])).toEqual([
      ['Z Googlu', 'google', 'thread_1'],
    ]);
  });

  it('marks the connection for reauthorization when Google rejects the token', async () => {
    const engine = createTestEngine();
    const connection = await connect(engine);
    engine.google.gateway.failWith = reauthorizationError();

    const synced = await engine.services.googleCalendar.sync(USER_ID, connection.id);

    expect(synced.status).toBe('reauthorize');
    expect(synced.lastError).toContain('Pripoj účet znova');
    engine.clock.advance(3_600_000);
    expect(await engine.services.googleCalendar.syncDue()).toBe(0);
  });

  it('polls due connections and clears the events of a disabled calendar', async () => {
    const engine = createTestEngine({ calendar: { googleSyncSeconds: 300 } });
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a', summary: 'A' }));
    const connection = await connect(engine);
    expect(await engine.services.googleCalendar.syncDue()).toBe(0);

    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'b', summary: 'B' }));
    engine.clock.advance(301_000);
    expect(await engine.services.googleCalendar.syncDue()).toBe(1);
    expect((await titles(engine)).sort()).toEqual(['A', 'B']);

    const primary = present(connection.calendars[0]);
    const disabled = await engine.services.googleCalendar.updateCalendar(USER_ID, primary.id, {
      enabled: false,
      color: '#112233',
    });
    expect(disabled).toMatchObject({ enabled: false, color: '#112233', status: 'pending' });
    expect(await titles(engine)).toEqual([]);
  });

  it('removes calendars, events and tokens on disconnect', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'a' }));
    const connection = await connect(engine);

    await engine.services.googleCalendar.disconnect(USER_ID, connection.id);

    expect(engine.db.tables.googleCalendars.size).toBe(0);
    expect(engine.db.tables.calendarEvents.size).toBe(0);
    expect(engine.google.credentials.stored.size).toBe(0);
    expect((await engine.services.googleCalendar.overview(USER_ID)).connections).toEqual([]);
  });
});

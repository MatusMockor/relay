import type {
  GoogleCalendarRecord,
  GoogleConnectionRecord,
  GoogleEventRecord,
  StoredCalendarEvent,
} from '@relay/engine';
import {
  CalendarConnectionIdSchema,
  CalendarEventIdSchema,
  GoogleCalendarIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { createTestStore, type TestStore } from './support/test-database';

const connectionId = CalendarConnectionIdSchema.parse('ccn-1');
const calendarId = GoogleCalendarIdSchema.parse('gcl-1');
const NOW = '2026-11-15T08:00:00.000Z';

const connection = (overrides: Partial<GoogleConnectionRecord> = {}): GoogleConnectionRecord => ({
  id: connectionId,
  userId: LOCAL_USER_ID,
  email: 'me@example.com',
  accountId: null,
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const calendar = (overrides: Partial<GoogleCalendarRecord> = {}): GoogleCalendarRecord => ({
  id: calendarId,
  userId: LOCAL_USER_ID,
  connectionId,
  remoteId: 'me@example.com',
  name: 'Ja',
  color: '#039be5',
  enabled: true,
  primary: true,
  accessRole: 'owner',
  timeZone: 'Europe/Bratislava',
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  syncToken: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const record = (
  remoteId: string,
  overrides: Partial<StoredCalendarEvent> = {},
  etag = '"1"',
): GoogleEventRecord => ({
  calendarId,
  remoteId,
  etag,
  event: {
    id: CalendarEventIdSchema.parse(`evt-${remoteId}-${String(Math.random()).slice(2, 8)}`),
    userId: LOCAL_USER_ID,
    source: { kind: 'google', calendarId },
    uid: `${remoteId}@google.com`,
    recurrenceId: null,
    sequence: 0,
    dtstamp: NOW,
    status: 'confirmed',
    summary: remoteId,
    location: null,
    description: null,
    organizer: null,
    attendees: [],
    method: null,
    myPartstat: null,
    myEmail: 'me@example.com',
    allDay: false,
    startsAt: '2026-11-16T09:00:00.000Z',
    endsAt: '2026-11-16T10:00:00.000Z',
    recurring: false,
    rangeEndsAt: '2026-11-16T10:00:00.000Z',
    ics: 'ICS',
    messageId: null,
    threadId: null,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 0,
    ...overrides,
  },
});

const RANGE = { from: '2026-11-16T00:00:00.000Z', to: '2026-11-17T00:00:00.000Z' };

describe('SQLite Google calendar repositories', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await store.repositories.googleConnections.save(connection());
    await store.repositories.googleCalendars.save(calendar());
  });

  afterEach(() => {
    store.database.close();
  });

  it('stores connections, records sync attempts and lists due ones', async () => {
    const { googleConnections } = store.repositories;
    expect(await googleConnections.findByEmail(LOCAL_USER_ID, 'me@example.com')).toMatchObject({
      id: connectionId,
    });
    expect(await googleConnections.listDue(NOW, 10)).toHaveLength(1);

    await googleConnections.recordSync(connectionId, {
      status: 'ok',
      lastError: null,
      attemptedAt: '2026-11-15T09:00:00.000Z',
      syncedAt: '2026-11-15T09:00:00.000Z',
    });
    expect(await googleConnections.listDue('2026-11-15T09:00:00.000Z', 10)).toEqual([]);
    expect(await googleConnections.listDue('2026-11-15T09:05:00.000Z', 10)).toHaveLength(1);

    await googleConnections.recordSync(connectionId, {
      status: 'reauthorize',
      lastError: 'x',
      attemptedAt: '2026-11-15T09:10:00.000Z',
      syncedAt: null,
    });
    expect(await googleConnections.listDue('2026-11-16T00:00:00.000Z', 10)).toEqual([]);
    expect(await googleConnections.findById(LOCAL_USER_ID, connectionId)).toMatchObject({
      status: 'reauthorize',
      lastSyncedAt: '2026-11-15T09:00:00.000Z',
    });
  });

  it('keeps preferences and sync tokens of calendars', async () => {
    const { googleCalendars } = store.repositories;
    await googleCalendars.recordSync(calendarId, {
      status: 'ok',
      lastError: null,
      syncedAt: NOW,
      syncToken: 'sync-1',
    });
    const updated = await googleCalendars.updatePreferences(LOCAL_USER_ID, calendarId, {
      color: '#112233',
      updatedAt: NOW,
    });

    expect(updated).toMatchObject({ color: '#112233', enabled: true, syncToken: 'sync-1' });
    expect(await googleCalendars.lockForSync(calendarId)).toMatchObject({ status: 'ok' });
    expect(await googleCalendars.listByUser(LOCAL_USER_ID)).toHaveLength(1);
  });

  it('upserts Google events by series, keeps the first id and updates the ETag', async () => {
    const { googleEvents, calendarEvents } = store.repositories;
    const first = record('a');
    await googleEvents.save([first]);
    await googleEvents.save([record('a', { summary: 'A2' }, '"2"')]);

    const found = await googleEvents.findByRemoteId(calendarId, 'a');
    expect(found).toMatchObject({ etag: '"2"', event: { id: first.event.id, summary: 'A2' } });
    expect(await googleEvents.findById(LOCAL_USER_ID, first.event.id)).toEqual(found);
    const listed = await calendarEvents.listForRange(LOCAL_USER_ID, RANGE);
    expect(listed.map((event) => event.source)).toEqual([{ kind: 'google', calendarId }]);
    expect(await googleEvents.findByUid(LOCAL_USER_ID, 'a@google.com')).toHaveLength(1);
  });

  it('keeps advancing revisions through saves and whole calendar replacement', async () => {
    const { googleEvents } = store.repositories;
    await googleEvents.save([record('a')]);
    await googleEvents.save([record('a', { summary: 'A2' })]);
    const saved = await googleEvents.findByRemoteId(calendarId, 'a');
    expect(saved?.event.revision).toBe(2);

    const replacement = record('a', { summary: 'A3' });
    await googleEvents.replaceCalendar(calendarId, [
      {
        ...replacement,
        event: { ...replacement.event, id: saved?.event.id ?? replacement.event.id },
      },
    ]);

    const replaced = await googleEvents.findByRemoteId(calendarId, 'a');
    expect(replaced?.event).toMatchObject({ id: saved?.event.id, summary: 'A3', revision: 3 });
  });

  it('removes a series with its overrides and replaces a whole calendar', async () => {
    const { googleEvents } = store.repositories;
    await googleEvents.save([
      record('series', { recurring: true, rangeEndsAt: null }),
      record('series_1', { uid: 'series@google.com', recurrenceId: '2026-11-16T09:00:00.000Z' }),
      record('b'),
    ]);

    await googleEvents.removeSeries(calendarId, 'series@google.com');
    expect(await googleEvents.findByRemoteId(calendarId, 'series_1')).toBeNull();
    expect(await googleEvents.findByRemoteId(calendarId, 'b')).not.toBeNull();

    await googleEvents.replaceCalendar(calendarId, [record('c')]);
    expect(await googleEvents.findByRemoteId(calendarId, 'b')).toBeNull();
    expect(await googleEvents.findByRemoteId(calendarId, 'c')).not.toBeNull();
  });

  it('cascades a disconnect to calendars and their events', async () => {
    await store.repositories.googleEvents.save([record('a')]);

    expect(await store.repositories.googleConnections.delete(LOCAL_USER_ID, connectionId)).toBe(
      true,
    );

    expect(await store.repositories.googleCalendars.listByUser(LOCAL_USER_ID)).toEqual([]);
    expect(await store.repositories.calendarEvents.listForRange(LOCAL_USER_ID, RANGE)).toEqual([]);
  });
});

import type { GoogleEventChange, RemoteGoogleEvent, StoredCalendarEvent } from '@relay/engine';
import type {
  CalendarConnectionId,
  CalendarEventId,
  CalendarSubscriptionId,
  UserId,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpGoogleCalendarGateway, IcalCalendarExpander, IcalCalendarParser } from '../../src';
import { type GoogleApiStub, startGoogleApiStub } from '../support/google-api-stub';

const CONNECTION = 'ccn_1' as CalendarConnectionId;
const ZONE = 'Europe/Bratislava';

const request = (
  overrides: Partial<Parameters<HttpGoogleCalendarGateway['listEvents']>[1]> = {},
) => ({
  calendarRemoteId: 'me@example.com',
  timeZone: ZONE,
  syncToken: null,
  pageToken: null,
  timeMin: '2025-11-15T10:00:00.000Z',
  ...overrides,
});

const eventsOf = (changes: readonly GoogleEventChange[]): RemoteGoogleEvent[] =>
  changes.flatMap((change) => (change.kind === 'event' ? [change.event] : []));

const stored = (event: RemoteGoogleEvent, index: number): StoredCalendarEvent => ({
  ...event.data,
  uid: event.uid ?? 'series@google.com',
  id: `evt_${String(index)}` as CalendarEventId,
  userId: 'user_1' as UserId,
  source: { kind: 'subscription', subscriptionId: 'sub' as CalendarSubscriptionId },
  revision: 1,
  method: null,
  myPartstat: event.myPartstat,
  myEmail: event.myEmail,
  messageId: null,
  threadId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

describe('Google Calendar API gateway (read)', () => {
  let stub: GoogleApiStub;
  let gateway: HttpGoogleCalendarGateway;

  beforeEach(async () => {
    stub = await startGoogleApiStub();
    gateway = new HttpGoogleCalendarGateway({
      baseUrl: stub.baseUrl,
      tokens: { accessToken: () => Promise.resolve('token-1') },
      parser: new IcalCalendarParser(),
    });
  });

  afterEach(async () => {
    await stub.close();
  });

  it('pages through the calendar list and skips deleted entries', async () => {
    stub.handle((req) =>
      req.query.get('pageToken') === null
        ? {
            status: 200,
            body: {
              items: [
                {
                  id: 'me@example.com',
                  summary: 'Ja',
                  primary: true,
                  selected: true,
                  accessRole: 'owner',
                  backgroundColor: '#9fe1e7',
                  timeZone: ZONE,
                },
                { id: 'old@group', summary: 'Starý', deleted: true, accessRole: 'owner' },
              ],
              nextPageToken: 'p2',
            },
          }
        : {
            status: 200,
            body: {
              items: [
                {
                  id: 'team@group',
                  summary: 'Tím',
                  summaryOverride: 'Môj tím',
                  accessRole: 'reader',
                },
              ],
            },
          },
    );

    const calendars = await gateway.listCalendars(CONNECTION);

    expect(calendars).toEqual([
      {
        remoteId: 'me@example.com',
        name: 'Ja',
        color: '#9fe1e7',
        primary: true,
        selected: true,
        accessRole: 'owner',
        timeZone: ZONE,
      },
      {
        remoteId: 'team@group',
        name: 'Môj tím',
        color: null,
        primary: false,
        selected: false,
        accessRole: 'reader',
        timeZone: null,
      },
    ]);
    expect(stub.requests[0]?.headers.authorization).toBe('Bearer token-1');
    expect(stub.requests[1]?.query.get('pageToken')).toBe('p2');
  });

  it('maps timed, all-day, cancelled and attendee data and sends sync parameters', async () => {
    stub.handle(() => ({
      status: 200,
      body: {
        nextSyncToken: 'sync-2',
        items: [
          {
            id: 'timed',
            etag: '"e1"',
            iCalUID: 'timed@google.com',
            status: 'confirmed',
            summary: 'Porada; plán, Q1',
            location: 'Dunaj',
            updated: '2026-11-14T08:00:00.000Z',
            start: { dateTime: '2026-11-16T09:00:00+01:00', timeZone: ZONE },
            end: { dateTime: '2026-11-16T10:00:00+01:00', timeZone: ZONE },
            organizer: { email: 'boss@example.com', displayName: 'Šéf' },
            attendees: [
              { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
              { email: 'Me@Example.com', self: true, responseStatus: 'tentative', optional: true },
              { email: 'room@resource.calendar.google.com', resource: true },
            ],
          },
          {
            id: 'day',
            etag: '"e2"',
            iCalUID: 'day@google.com',
            summary: 'Sviatok',
            start: { date: '2026-11-17' },
            end: { date: '2026-11-18' },
          },
          { id: 'gone', status: 'cancelled' },
          { id: 'nostart', summary: 'bez času' },
        ],
      },
    }));

    const result = await gateway.listEvents(CONNECTION, request({ syncToken: 'sync-1' }));

    const query = stub.requests[0]?.query;
    expect(query?.get('syncToken')).toBe('sync-1');
    expect(query?.get('timeMin')).toBeNull();
    expect(query?.get('singleEvents')).toBe('false');
    expect(query?.get('showDeleted')).toBe('true');
    expect(result).toMatchObject({ kind: 'page', nextPageToken: null, nextSyncToken: 'sync-2' });
    const changes = result.kind === 'page' ? result.changes : [];
    expect(changes.filter((change) => change.kind === 'removed')).toEqual([
      { kind: 'removed', remoteId: 'gone', uid: null },
    ]);
    const [timed, day] = eventsOf(changes);
    expect(timed).toMatchObject({
      remoteId: 'timed',
      etag: '"e1"',
      uid: 'timed@google.com',
      myPartstat: 'tentative',
      myEmail: 'me@example.com',
      data: {
        summary: 'Porada; plán, Q1',
        startsAt: '2026-11-16T08:00:00.000Z',
        endsAt: '2026-11-16T09:00:00.000Z',
        dtstamp: '2026-11-14T08:00:00.000Z',
        organizer: { name: 'Šéf', email: 'boss@example.com' },
      },
    });
    expect(timed?.data.attendees.map((attendee) => [attendee.email, attendee.partstat])).toEqual([
      ['boss@example.com', 'accepted'],
      ['me@example.com', 'tentative'],
    ]);
    expect(day?.data).toMatchObject({ allDay: true, summary: 'Sviatok' });
    expect(eventsOf(changes)).toHaveLength(2);
  });

  it('reports an expired sync token on 410 Gone', async () => {
    stub.handle(() => ({
      status: 410,
      body: { error: { code: 410, errors: [{ reason: 'fullSyncRequired' }] } },
    }));

    expect(await gateway.listEvents(CONNECTION, request({ syncToken: 'old' }))).toEqual({
      kind: 'expired',
    });
  });

  it('expands a recurring series with moved and cancelled instances across the DST change', async () => {
    stub.handle(() => ({
      status: 200,
      body: {
        items: [
          {
            id: 'series',
            etag: '"s"',
            iCalUID: 'series@google.com',
            summary: 'Weekly',
            start: { dateTime: '2026-10-19T09:00:00+02:00', timeZone: ZONE },
            end: { dateTime: '2026-10-19T09:30:00+02:00', timeZone: ZONE },
            recurrence: [
              'RRULE:FREQ=WEEKLY;COUNT=4',
              'EXDATE;TZID=Europe/Bratislava:20261102T090000',
            ],
          },
          {
            id: 'series_20261026T080000Z',
            status: 'cancelled',
            recurringEventId: 'series',
            originalStartTime: { dateTime: '2026-10-26T09:00:00+01:00', timeZone: ZONE },
          },
          {
            id: 'series_20261109T080000Z',
            etag: '"m"',
            iCalUID: 'series@google.com',
            summary: 'Weekly (moved)',
            recurringEventId: 'series',
            originalStartTime: { dateTime: '2026-11-09T09:00:00+01:00', timeZone: ZONE },
            start: { dateTime: '2026-11-09T14:00:00+01:00', timeZone: ZONE },
            end: { dateTime: '2026-11-09T14:30:00+01:00', timeZone: ZONE },
          },
        ],
      },
    }));

    const result = await gateway.listEvents(CONNECTION, request());
    const [master, cancelled, moved] = eventsOf(result.kind === 'page' ? result.changes : []);
    expect(cancelled).toMatchObject({
      uid: null,
      recurringRemoteId: 'series',
      data: { status: 'cancelled', recurrenceId: '2026-10-26T08:00:00.000Z' },
    });
    expect(moved?.data.recurrenceId).toBe('2026-11-09T08:00:00.000Z');

    const rows = [master, cancelled, moved].map((event, index) =>
      stored(event as RemoteGoogleEvent, index),
    );
    const occurrences = new IcalCalendarExpander()
      .expand(
        { master: rows[0] ?? null, overrides: rows.slice(1) },
        { from: '2026-10-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z', timeZone: ZONE },
      )
      .filter((occurrence) => occurrence.event.status !== 'cancelled');
    expect(occurrences.map((occurrence) => [occurrence.start, occurrence.event.summary])).toEqual([
      ['2026-10-19T07:00:00.000Z', 'Weekly'],
      ['2026-11-09T13:00:00.000Z', 'Weekly (moved)'],
    ]);
  });

  it('rejects a response that does not match the API schema', async () => {
    stub.handle(() => ({ status: 200, body: { items: [{ summary: 'no id' }] } }));

    await expect(gateway.listEvents(CONNECTION, request())).rejects.toMatchObject({
      code: 'provider_error',
    });
  });
});

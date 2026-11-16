import { ReauthorizationRequiredError } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpGoogleCalendarGateway, IcalCalendarParser } from '../../src';
import { type GoogleApiStub, startGoogleApiStub } from '../support/google-api-stub';

const CONNECTION = 'ccn_1' as CalendarConnectionId;
const REF = { connectionId: CONNECTION, calendarRemoteId: 'me@example.com', remoteId: 'inv' };
const ZONE = 'Europe/Bratislava';

const invitation = (etag: string) => ({
  id: 'inv',
  etag,
  iCalUID: 'inv@partner.test',
  summary: 'Pozvánka',
  start: { dateTime: '2026-11-16T09:00:00Z' },
  end: { dateTime: '2026-11-16T10:00:00Z' },
  organizer: { email: 'boss@example.com' },
  attendees: [
    { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
    { email: 'me@example.com', self: true, responseStatus: 'needsAction', comment: 'keep me' },
  ],
});

describe('Google Calendar API gateway (write)', () => {
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

  it('patches only my response status with If-Match and keeps the other attendee fields', async () => {
    stub.handle((req) => {
      if (req.method === 'GET') {
        return { status: 200, body: invitation('"v1"') };
      }
      const body = req.body as { attendees: Record<string, unknown>[] };
      return { status: 200, body: { ...invitation('"v2"'), attendees: body.attendees } };
    });

    const result = await gateway.setAttendance(
      REF,
      { etag: '"v1"', attendeeEmail: 'me@example.com', response: 'accepted' },
      ZONE,
    );

    expect(result).toMatchObject({ kind: 'ok', value: { etag: '"v2"', myPartstat: 'accepted' } });
    const patch = stub.requests[1];
    expect(patch?.method).toBe('PATCH');
    expect(patch?.path).toBe('/calendars/me@example.com/events/inv');
    expect(patch?.headers['if-match']).toBe('"v1"');
    expect(patch?.query.get('sendUpdates')).toBe('all');
    expect(patch?.body).toEqual({
      attendees: [
        { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
        { email: 'me@example.com', self: true, responseStatus: 'accepted', comment: 'keep me' },
      ],
    });
  });

  it('reports a conflict when the event changed before or during the patch', async () => {
    stub.handle(() => ({ status: 200, body: invitation('"v9"') }));
    expect(
      await gateway.setAttendance(
        REF,
        { etag: '"v1"', attendeeEmail: 'me@example.com', response: 'declined' },
        ZONE,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(stub.requests.map((req) => req.method)).toEqual(['GET']);

    stub.handle((req) =>
      req.method === 'GET' ? { status: 200, body: invitation('"v1"') } : { status: 412, body: {} },
    );
    expect(
      await gateway.setAttendance(
        REF,
        { etag: '"v1"', attendeeEmail: 'me@example.com', response: 'declined' },
        ZONE,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it('creates all-day and timed events with the right body', async () => {
    stub.handle((req) => {
      const body = req.body as Record<string, unknown>;
      return { status: 200, body: { id: 'new', etag: '"n"', iCalUID: 'new@google.com', ...body } };
    });

    const allDay = await gateway.insertEvent(CONNECTION, 'me@example.com', {
      title: 'Dovolenka',
      allDay: true,
      start: '2026-11-19T23:00:00.000Z',
      end: '2026-11-21T23:00:00.000Z',
      timeZone: ZONE,
      location: null,
      attendees: [],
    });
    await gateway.insertEvent(CONNECTION, 'me@example.com', {
      title: 'Obed',
      allDay: false,
      start: '2026-11-20T11:00:00.000Z',
      end: '2026-11-20T12:00:00.000Z',
      timeZone: ZONE,
      location: 'Bistro',
      attendees: ['peter@example.com'],
    });

    expect(stub.requests[0]?.body).toEqual({
      summary: 'Dovolenka',
      start: { date: '2026-11-20' },
      end: { date: '2026-11-22' },
    });
    expect(stub.requests[0]?.query.get('sendUpdates')).toBe('none');
    expect(stub.requests[1]?.body).toEqual({
      summary: 'Obed',
      location: 'Bistro',
      start: { dateTime: '2026-11-20T11:00:00.000Z', timeZone: ZONE },
      end: { dateTime: '2026-11-20T12:00:00.000Z', timeZone: ZONE },
      attendees: [{ email: 'peter@example.com' }],
    });
    expect(stub.requests[1]?.query.get('sendUpdates')).toBe('all');
    expect(allDay.data).toMatchObject({ allDay: true, summary: 'Dovolenka' });
  });

  it('deletes with If-Match and maps 412 and 410', async () => {
    const statuses = [204, 412, 410];
    stub.handle(() => ({ status: statuses.shift() ?? 500 }));

    expect(await gateway.deleteEvent(REF, '"v1"')).toEqual({ kind: 'ok', value: null });
    expect(await gateway.deleteEvent(REF, '"v1"')).toEqual({ kind: 'conflict' });
    expect(await gateway.deleteEvent(REF, '"v1"')).toEqual({ kind: 'gone' });
    expect(stub.requests[0]?.headers['if-match']).toBe('"v1"');
    expect(stub.requests[0]?.method).toBe('DELETE');
  });

  it('asks for reauthorization on 401 and missing scopes, and never leaks the token', async () => {
    stub.handle(() => ({ status: 401, body: { error: { code: 401 } } }));
    const unauthorized = await gateway.listCalendars(CONNECTION).catch((error: unknown) => error);
    expect(unauthorized).toBeInstanceOf(ReauthorizationRequiredError);
    expect((unauthorized as Error).message).not.toContain('token-1');

    stub.handle(() => ({
      status: 403,
      body: { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } },
    }));
    await expect(gateway.getEvent(REF, ZONE)).rejects.toBeInstanceOf(ReauthorizationRequiredError);

    stub.handle(() => ({
      status: 403,
      body: { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
    }));
    await expect(gateway.getEvent(REF, ZONE)).rejects.toMatchObject({ code: 'provider_error' });
  });
});

import type { GoogleEventChange, StoredCalendarEvent } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpGoogleCalendarGateway, IcalCalendarParser } from '../../src';
import { stored } from '../support/fixtures';
import { type GoogleApiStub, startGoogleApiStub } from '../support/google-api-stub';
import { expander, windowOf } from '../support/series-ics';

const ZONE = 'Europe/Bratislava';

const exception = (day: string, updated: string, sequence: number) => ({
  id: `series_202611${day}T080000Z`,
  iCalUID: 'series@google.com',
  summary: `Weekly ${day}.`,
  updated,
  sequence,
  recurringEventId: 'series',
  originalStartTime: { dateTime: `2026-11-${day}T09:00:00+01:00`, timeZone: ZONE },
  start: { dateTime: `2026-11-${day}T14:00:00+01:00`, timeZone: ZONE },
  end: { dateTime: `2026-11-${day}T14:30:00+01:00`, timeZone: ZONE },
});

describe('Google Calendar API revision order across the series and its exceptions', () => {
  let stub: GoogleApiStub;

  beforeEach(async () => {
    stub = await startGoogleApiStub();
  });

  afterEach(async () => {
    await stub.close();
  });

  it('compares exceptions with a shortened series by updated, not by sequence', async () => {
    stub.handle(() => ({
      status: 200,
      body: {
        items: [
          {
            id: 'series',
            iCalUID: 'series@google.com',
            summary: 'Weekly',
            updated: '2026-11-05T10:00:00.000Z',
            sequence: 1,
            start: { dateTime: '2026-11-02T09:00:00+01:00', timeZone: ZONE },
            end: { dateTime: '2026-11-02T09:30:00+01:00', timeZone: ZONE },
            recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261115T225959Z'],
          },
          exception('23', '2026-11-01T10:00:00.000Z', 7),
          exception('30', '2026-11-06T10:00:00.000Z', 0),
        ],
      },
    }));
    const gateway = new HttpGoogleCalendarGateway({
      baseUrl: stub.baseUrl,
      tokens: { accessToken: () => Promise.resolve('token-1') },
      parser: new IcalCalendarParser(),
    });

    const result = await gateway.listEvents('ccn_1' as CalendarConnectionId, {
      calendarRemoteId: 'me@example.com',
      timeZone: ZONE,
      syncToken: null,
      pageToken: null,
      timeMin: '2026-10-01T00:00:00.000Z',
    });
    const changes: readonly GoogleEventChange[] = result.kind === 'page' ? result.changes : [];
    const rows: StoredCalendarEvent[] = changes.flatMap((change) =>
      change.kind === 'event' ? [stored({ ...change.event.data, uid: 'series@google.com' })] : [],
    );
    const occurrences = expander.expand(
      { master: rows[0] ?? null, overrides: rows.slice(1) },
      windowOf('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', ZONE),
    );

    expect(rows.map((row) => [row.sequence, row.dtstamp])).toEqual([
      [1, '2026-11-05T10:00:00.000Z'],
      [7, '2026-11-01T10:00:00.000Z'],
      [0, '2026-11-06T10:00:00.000Z'],
    ]);
    expect(occurrences.map((occurrence) => [occurrence.start, occurrence.event.summary])).toEqual([
      ['2026-11-02T08:00:00.000Z', 'Weekly'],
      ['2026-11-09T08:00:00.000Z', 'Weekly'],
      ['2026-11-30T13:00:00.000Z', 'Weekly 30.'],
    ]);
  });
});

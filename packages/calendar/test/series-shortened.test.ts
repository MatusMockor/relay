import type { CalendarSeries, GoogleEventChange, StoredCalendarEvent } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpGoogleCalendarGateway, IcalCalendarParser } from '../src';
import { present, stored } from './support/fixtures';
import { type GoogleApiStub, startGoogleApiStub } from './support/google-api-stub';
import { expander, seriesFrom, vcalendar, windowOf } from './support/series-ics';

const UID = 'UID:report@partner.test';
const ZONE = 'Europe/Bratislava';

const daily = (sequence: number, rule: string) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:2026110${String(sequence)}T070000Z`,
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report',
      'DTSTART:20261101T090000Z',
      'DTEND:20261101T093000Z',
      `RRULE:${rule}`,
    ],
  );

const moved = (day: string, toDay: string, sequence: number, stamp: string) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      `SUMMARY:Report z ${day}.`,
      `RECURRENCE-ID:202611${day}T090000Z`,
      `DTSTART:202611${toDay}T150000Z`,
      `DTEND:202611${toDay}T153000Z`,
    ],
  );

const overrides = [
  moved('04', '04', 1, '20261101T100000Z'),
  moved('07', '07', 1, '20261101T100000Z'),
  moved('09', '03', 1, '20261101T100000Z'),
  moved('08', '08', 3, '20261106T080000Z'),
];

const shown = (series: CalendarSeries, from: string, to: string) =>
  expander
    .expand(series, windowOf(from, to, 'UTC'))
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => `${occurrence.start.slice(5, 16)} ${occurrence.event.summary}`);

describe('overrides beyond a shortened series', () => {
  it('hides older overrides that are no longer occurrences and keeps re-sent ones', () => {
    const shortened = seriesFrom(
      'report@partner.test',
      daily(2, 'FREQ=DAILY;UNTIL=20261105T235959Z'),
      ...overrides,
    );

    expect(shown(shortened, '2026-11-01T00:00:00Z', '2026-11-12T00:00:00Z')).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-03T09:00 Report',
      '11-04T15:00 Report z 04.',
      '11-05T09:00 Report',
      '11-08T15:00 Report z 08.',
    ]);
  });

  it('expands the current ICS of a master stored again with the same id and timestamp', () => {
    const first = present(
      seriesFrom('report@partner.test', daily(0, 'FREQ=DAILY;COUNT=10')).master,
    );
    const second = present(
      seriesFrom('report@partner.test', daily(3, 'FREQ=DAILY;COUNT=12')).master,
    );
    const window = ['2026-11-10T00:00:00Z', '2026-11-14T00:00:00Z'] as const;

    expect(shown({ master: first, overrides: [] }, ...window)).toHaveLength(1);
    expect(shown({ master: { ...second, id: first.id }, overrides: [] }, ...window)).toHaveLength(
      3,
    );
  });

  it('keeps an older override when the membership check runs out of iterations', () => {
    const hourly = seriesFrom(
      'report@partner.test',
      daily(2, 'FREQ=HOURLY;COUNT=30000'),
      vcalendar(
        'REQUEST',
        [],
        [
          UID,
          'DTSTAMP:20261101T100000Z',
          'SEQUENCE:1',
          'SUMMARY:Report z budúcnosti',
          'RECURRENCE-ID:20290728T170000Z',
          'DTSTART:20261101T120000Z',
          'DTEND:20261101T123000Z',
        ],
      ),
    );

    expect(shown(hourly, '2026-11-01T11:30:00Z', '2026-11-01T12:15:00Z')).toEqual([
      '11-01T12:00 Report',
      '11-01T12:00 Report z budúcnosti',
    ]);
  });

  it('keeps an override moved into the window from an occurrence after it', () => {
    const full = seriesFrom('report@partner.test', daily(0, 'FREQ=DAILY;COUNT=10'), ...overrides);

    expect(shown(full, '2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      '11-03T09:00 Report',
      '11-03T15:00 Report z 09.',
    ]);
  });
});

describe('Google Calendar API exceptions beyond a "this and following" split', () => {
  let stub: GoogleApiStub;

  beforeEach(async () => {
    stub = await startGoogleApiStub();
  });

  afterEach(async () => {
    await stub.close();
  });

  const exception = (day: string, updated: string, sequence = 0) => ({
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

  it('hides exceptions after the new UNTIL that are older than the shortened master', async () => {
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
          exception('09', '2026-11-01T10:00:00.000Z'),
          exception('23', '2026-11-01T10:00:00.000Z'),
          exception('30', '2026-11-06T10:00:00.000Z', 1),
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

    expect(occurrences.map((occurrence) => [occurrence.start, occurrence.event.summary])).toEqual([
      ['2026-11-02T08:00:00.000Z', 'Weekly'],
      ['2026-11-09T13:00:00.000Z', 'Weekly 09.'],
      ['2026-11-30T13:00:00.000Z', 'Weekly 30.'],
    ]);
  });
});

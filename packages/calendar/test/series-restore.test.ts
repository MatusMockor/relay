import type { CalendarSeries } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { IcalReplyBuilder } from '../src';
import { present } from './support/fixtures';
import {
  expander,
  parsedEvents,
  rangeEndOf,
  seriesFrom,
  vcalendar,
  windowOf,
} from './support/series-ics';

const UID = 'UID:report@partner.test';
const WINDOW = windowOf('2026-11-01T00:00:00Z', '2026-11-14T00:00:00Z', 'UTC');

const daily = (sequence: number, count: number) =>
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
      `RRULE:FREQ=DAILY;COUNT=${String(count)}`,
    ],
  );

const range = (day: string, hour: string, summary: string) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:1',
      `SUMMARY:${summary}`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T${hour}0000Z`,
      `DTEND:202611${day}T${hour}3000Z`,
    ],
  );

const moved = (day: string, sequence = 1, stamp = '20261101T090000Z') =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report presunutý',
      `RECURRENCE-ID:202611${day}T090000Z`,
      `DTSTART:202611${day}T150000Z`,
      `DTEND:202611${day}T153000Z`,
    ],
  );

const cancel = (recurrenceId: string, sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [UID, 'DTSTAMP:20261102T080000Z', `SEQUENCE:${String(sequence)}`, recurrenceId],
  );

const withCancelledMaster = (series: CalendarSeries, sequence: number): CalendarSeries => {
  const master = present(series.master);
  return {
    ...series,
    master: { ...master, status: 'cancelled', sequence, dtstamp: '2026-11-02T08:00:00.000Z' },
  };
};

const shown = (series: CalendarSeries) =>
  expander
    .expand(series, WINDOW)
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => `${occurrence.start.slice(5, 16)} ${occurrence.event.summary}`);

const records = (...extra: string[]) => [
  range('03', '11', 'Report o 11:00'),
  moved('06'),
  cancel('RECURRENCE-ID:20261107T090000Z', 1),
  ...extra,
];

describe('series restored by a newer master', () => {
  it('hides older records under a whole-series CANCEL and brings them back with a newer master', () => {
    const cancelled = withCancelledMaster(
      seriesFrom(
        'report@partner.test',
        daily(0, 10),
        ...records(moved('08', 3, '20261103T080000Z')),
      ),
      2,
    );
    const restored = seriesFrom('report@partner.test', daily(3, 10), ...records());

    expect(shown(cancelled)).toEqual(['11-08T15:00 Report presunutý']);
    expect(rangeEndOf(cancelled)).toBe('2026-11-11T09:30:00.000Z');
    expect(shown(restored)).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-03T11:00 Report o 11:00',
      '11-04T11:00 Report o 11:00',
      '11-05T11:00 Report o 11:00',
      '11-06T15:00 Report presunutý',
      '11-08T11:00 Report o 11:00',
      '11-09T11:00 Report o 11:00',
      '11-10T11:00 Report o 11:00',
    ]);
    expect(rangeEndOf(restored)).toBe('2026-11-11T11:30:00.000Z');
    const derived = present(
      expander
        .expand(restored, WINDOW)
        .find((occurrence) => occurrence.recurrenceId === '2026-11-09T09:00:00.000Z'),
    );
    const reply = new IcalReplyBuilder().build({
      event: derived.event,
      attendee: { name: 'Jana', email: 'jana@example.com' },
      response: 'accepted',
      dtstamp: '2026-11-08T08:00:00.000Z',
    });
    expect(reply).toContain('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z');
    expect(parsedEvents(reply)[0]).toMatchObject({ thisAndFuture: true, sequence: 1 });
  });

  it('ignores a cut once a newer master extends the series and keeps what it hid', () => {
    const hidden = [
      range('03', '11', 'Report o 11:00'),
      range('05', '13', 'Report o 13:00'),
      cancel('RECURRENCE-ID;RANGE=THISANDFUTURE:20261105T090000Z', 2),
      moved('08'),
      cancel('RECURRENCE-ID:20261109T090000Z', 1),
    ];
    const cut = seriesFrom('report@partner.test', daily(0, 10), ...hidden);
    const extended = seriesFrom('report@partner.test', daily(3, 12), ...hidden);

    expect(shown(cut)).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-03T11:00 Report o 11:00',
      '11-04T11:00 Report o 11:00',
    ]);
    expect(rangeEndOf(cut)).toBe('2026-11-06T13:30:00.000Z');
    expect(shown(extended)).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-03T11:00 Report o 11:00',
      '11-04T11:00 Report o 11:00',
      '11-05T13:00 Report o 13:00',
      '11-06T13:00 Report o 13:00',
      '11-07T13:00 Report o 13:00',
      '11-08T15:00 Report presunutý',
      '11-10T13:00 Report o 13:00',
      '11-11T13:00 Report o 13:00',
      '11-12T13:00 Report o 13:00',
    ]);
    expect(rangeEndOf(extended)).toBe('2026-11-13T13:30:00.000Z');
  });

  it('keeps a range request at the cut anchor hidden until it is newer than the cut', () => {
    const lifted = seriesFrom(
      'report@partner.test',
      daily(0, 10),
      cancel('RECURRENCE-ID;RANGE=THISANDFUTURE:20261105T090000Z', 1),
      vcalendar(
        'REQUEST',
        [],
        [
          UID,
          'DTSTAMP:20261103T080000Z',
          'SEQUENCE:2',
          'SUMMARY:Report o 13:00',
          'RECURRENCE-ID;RANGE=THISANDFUTURE:20261105T090000Z',
          'DTSTART:20261105T130000Z',
          'DTEND:20261105T133000Z',
        ],
      ),
    );

    expect(shown(lifted).slice(3, 6)).toEqual([
      '11-04T09:00 Report',
      '11-05T13:00 Report o 13:00',
      '11-06T13:00 Report o 13:00',
    ]);
  });
});

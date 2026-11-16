import type { CalendarSeries } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { expander, rangeEndOf, seriesFrom, vcalendar, windowOf } from './support/series-ics';

const UID = 'UID:revision@partner.test';
const NOVEMBER = windowOf('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z', 'UTC');

const series = (stamp: string, sequence: number, extra: readonly string[] = []) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report',
      'DTSTART:20261101T090000Z',
      'DTEND:20261101T093000Z',
      'RRULE:FREQ=DAILY;COUNT=7',
      ...extra,
    ],
  );

const moved = (day: string, stamp: string, sequence: number) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      `SUMMARY:Report z ${day}.`,
      `RECURRENCE-ID:202611${day}T090000Z`,
      `DTSTART:202611${day}T150000Z`,
      `DTEND:202611${day}T153000Z`,
    ],
  );

const rangeRequest = (day: string, stamp: string, sequence: number) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report o 11:00',
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T110000Z`,
      `DTEND:202611${day}T113000Z`,
    ],
  );

const cut = (day: string, stamp: string, sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
    ],
  );

const cancelledSeries = (stamp: string, sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report',
      'DTSTART:20261101T090000Z',
      'DTEND:20261101T093000Z',
      'RRULE:FREQ=DAILY;COUNT=7',
    ],
  );

const of = (...texts: string[]): CalendarSeries => seriesFrom('revision@partner.test', ...texts);

const shown = (value: CalendarSeries) =>
  expander
    .expand(value, NOVEMBER)
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => `${occurrence.start.slice(5, 16)} ${occurrence.event.summary}`);

describe('revision order across master, overrides, cuts and range records', () => {
  it('hides an instance edited more often than a newer cancelled series', () => {
    expect(
      shown(
        of(
          cancelledSeries('20261105T080000Z', 1),
          moved('03', '20261104T080000Z', 6),
          moved('04', '20261106T080000Z', 0),
        ),
      ),
    ).toEqual(['11-04T15:00 Report z 04.']);
  });

  it('hides an instance edited more often than a newer shortened series', () => {
    const shortened = series('20261105T080000Z', 1, ['EXDATE:20261103T090000Z']);

    expect(
      shown(of(shortened, moved('03', '20261102T080000Z', 4), moved('04', '20261101T080000Z', 4))),
    ).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-04T15:00 Report z 04.',
      '11-05T09:00 Report',
      '11-06T09:00 Report',
      '11-07T09:00 Report',
    ]);
    expect(
      shown(of(shortened, moved('03', '20261106T080000Z', 0))).includes('11-03T15:00 Report z 03.'),
    ).toBe(true);
  });

  it('applies a cut by its DTSTAMP, whatever the SEQUENCE of the series', () => {
    const master = series('20261102T080000Z', 5);
    const newerCut = of(master, cut('05', '20261103T080000Z', 0));
    const olderCut = of(master, cut('05', '20261101T080000Z', 9));

    expect(shown(newerCut)).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-03T09:00 Report',
      '11-04T09:00 Report',
    ]);
    expect(rangeEndOf(newerCut)).toBe('2026-11-06T09:30:00.000Z');
    expect(shown(olderCut)).toHaveLength(7);
    expect(rangeEndOf(olderCut)).toBe(rangeEndOf(of(master)));
  });

  it('lifts a cut with a later range request even when its SEQUENCE is lower', () => {
    const master = series('20261101T080000Z', 0);

    expect(
      shown(
        of(master, cut('03', '20261102T080000Z', 4), rangeRequest('05', '20261103T080000Z', 1)),
      ),
    ).toEqual([
      '11-01T09:00 Report',
      '11-02T09:00 Report',
      '11-05T11:00 Report o 11:00',
      '11-06T11:00 Report o 11:00',
      '11-07T11:00 Report o 11:00',
    ]);
    expect(
      shown(
        of(master, cut('03', '20261104T080000Z', 1), rangeRequest('05', '20261103T080000Z', 4)),
      ),
    ).toEqual(['11-01T09:00 Report', '11-02T09:00 Report']);
  });

  it('shows the later of an instance and a range record at the same recurrence id', () => {
    const master = series('20261101T080000Z', 0);
    const laterInstance = of(
      master,
      rangeRequest('03', '20261102T080000Z', 5),
      moved('03', '20261103T080000Z', 1),
    );
    const laterRange = of(
      master,
      moved('03', '20261102T080000Z', 5),
      rangeRequest('03', '20261103T080000Z', 1),
    );

    expect(shown(laterInstance).slice(2, 4)).toEqual([
      '11-03T15:00 Report z 03.',
      '11-04T11:00 Report o 11:00',
    ]);
    expect(shown(laterRange).slice(2, 4)).toEqual([
      '11-03T11:00 Report o 11:00',
      '11-04T11:00 Report o 11:00',
    ]);
  });

  it('falls back to SEQUENCE for components sent with the same DTSTAMP', () => {
    const stamp = '20261105T080000Z';
    const sameMessage = of(cancelledSeries(stamp, 2), moved('03', stamp, 3), moved('04', stamp, 1));

    expect(shown(sameMessage)).toEqual(['11-03T15:00 Report z 03.']);
  });

  it('orders a component without DTSTAMP first, whatever the order of the rows', () => {
    const unstamped = vcalendar(
      'REQUEST',
      [],
      [
        UID,
        'SEQUENCE:2',
        'SUMMARY:Report bez DTSTAMP',
        'RECURRENCE-ID:20261103T090000Z',
        'DTSTART:20261103T150000Z',
        'DTEND:20261103T153000Z',
      ],
    );
    const value = of(
      series('20261101T080000Z', 0),
      rangeRequest('03', '20261103T080000Z', 1),
      unstamped,
      cut('03', '20261102T080000Z', 3),
    );
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];

    for (const order of orders) {
      const overrides = order.map((index) => value.overrides[index]);
      expect(shown({ ...value, overrides: overrides.filter((row) => row !== undefined) })).toEqual([
        '11-01T09:00 Report',
        '11-02T09:00 Report',
        '11-03T11:00 Report o 11:00',
        '11-04T11:00 Report o 11:00',
        '11-05T11:00 Report o 11:00',
        '11-06T11:00 Report o 11:00',
        '11-07T11:00 Report o 11:00',
      ]);
    }
    expect(shown(of(cancelledSeries('20261105T080000Z', 0), unstamped))).toEqual([]);
  });
});

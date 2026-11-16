import { describe, expect, it } from 'vitest';
import { present, stored } from './support/fixtures';
import {
  expander,
  parsedEvents,
  rangeEndOf,
  seriesFrom,
  vcalendar,
  windowOf,
} from './support/series-ics';

const UID = 'UID:daily@partner.test';
const NOVEMBER = windowOf('2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z', 'UTC');

const daily = vcalendar(
  null,
  [],
  [
    UID,
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    'SUMMARY:Report',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T093000Z',
    'RRULE:FREQ=DAILY',
  ],
);

const rangeRequest = (day: string, sequence: number, summary: string, hour = '11') =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261102T080000Z',
      `SEQUENCE:${String(sequence)}`,
      `SUMMARY:${summary}`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T${hour}0000Z`,
      `DTEND:202611${day}T${hour}3000Z`,
    ],
  );

const rangeCancel = (day: string, sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      'DTSTAMP:20261102T090000Z',
      `SEQUENCE:${String(sequence)}`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
    ],
  );

const LATE_NOVEMBER = windowOf('2026-11-09T00:00:00Z', '2026-12-01T00:00:00Z', 'UTC');

const moved = (day: string, sequence: number) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261102T100000Z',
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Report presunutý',
      `RECURRENCE-ID:202611${day}T090000Z`,
      `DTSTART:202611${day}T150000Z`,
      `DTEND:202611${day}T153000Z`,
    ],
  );

const instanceCancel = (day: string, sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      'DTSTAMP:20261102T110000Z',
      `SEQUENCE:${String(sequence)}`,
      `RECURRENCE-ID:202611${day}T090000Z`,
    ],
  );

const shown = (series: ReturnType<typeof seriesFrom>, window = NOVEMBER) =>
  expander
    .expand(series, window)
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => [occurrence.start, occurrence.event.summary]);

describe('THISANDFUTURE ranges after cancellations', () => {
  it('keeps the range change when only its anchor occurrence is cancelled', () => {
    const range = stored(present(parsedEvents(rangeRequest('03', 1, 'Report o 11:00'))[0]));
    const series = seriesFrom('daily@partner.test', daily);
    const anchorCancelled = { ...range, status: 'cancelled' as const, sequence: 2 };

    expect(shown({ ...series, overrides: [anchorCancelled] }).slice(0, 4)).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-04T11:00:00.000Z', 'Report o 11:00'],
      ['2026-11-05T11:00:00.000Z', 'Report o 11:00'],
    ]);
    const derived = expander
      .expand({ ...series, overrides: [anchorCancelled] }, NOVEMBER)
      .find((occurrence) => occurrence.recurrenceId === '2026-11-04T09:00:00.000Z');
    expect(derived?.event).toMatchObject({ id: range.id, status: 'confirmed' });
  });

  it('keeps the range request revision when its anchor is cancelled later', () => {
    const [early] = parsedEvents(rangeRequest('03', 1, 'Report o 11:00'));
    expect(early).toMatchObject({ rangeRevision: { sequence: 1 } });
    const fromThird = stored(present(early));
    const fromFifth = stored(
      present(parsedEvents(rangeRequest('05', 2, 'Report o 13:00', '13'))[0]),
    );
    const series = seriesFrom('daily@partner.test', daily);
    const anchorCancelled = { ...fromThird, status: 'cancelled' as const, sequence: 3 };

    expect(shown({ ...series, overrides: [anchorCancelled, fromFifth] }).slice(0, 6)).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-04T11:00:00.000Z', 'Report o 11:00'],
      ['2026-11-05T13:00:00.000Z', 'Report o 13:00'],
      ['2026-11-06T13:00:00.000Z', 'Report o 13:00'],
      ['2026-11-07T13:00:00.000Z', 'Report o 13:00'],
    ]);
  });

  it('brings occurrences back from the anchor of a newer range request', () => {
    const restored = seriesFrom(
      'daily@partner.test',
      daily,
      rangeCancel('03', 1),
      rangeRequest('05', 2, 'Report znova'),
    );

    expect(parsedEvents(rangeCancel('03', 1))[0]).toMatchObject({ endsSeries: true });
    expect(shown(restored)).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-05T11:00:00.000Z', 'Report znova'],
      ['2026-11-06T11:00:00.000Z', 'Report znova'],
      ['2026-11-07T11:00:00.000Z', 'Report znova'],
      ['2026-11-08T11:00:00.000Z', 'Report znova'],
      ['2026-11-09T11:00:00.000Z', 'Report znova'],
    ]);
    expect(rangeEndOf(restored)).toBeNull();
  });

  it('keeps the cut for a range request that is not newer and ends again at a newer cut', () => {
    const stale = seriesFrom(
      'daily@partner.test',
      daily,
      rangeCancel('03', 1),
      rangeRequest('05', 1, 'Report staré'),
    );
    expect(shown(stale).map(([start]) => start)).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
    expect(rangeEndOf(stale)).toBe('2026-11-04T11:30:00.000Z');

    const endedAgain = seriesFrom(
      'daily@partner.test',
      daily,
      rangeCancel('03', 1),
      rangeRequest('05', 2, 'Report znova'),
      rangeCancel('08', 3),
    );
    expect(shown(endedAgain).map(([start]) => start)).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-05T11:00:00.000Z',
      '2026-11-06T11:00:00.000Z',
      '2026-11-07T11:00:00.000Z',
    ]);
    expect(rangeEndOf(endedAgain)).toBe('2026-11-09T11:30:00.000Z');
  });

  it('hides an override behind every cut that applies to it', () => {
    const series = seriesFrom(
      'daily@partner.test',
      daily,
      rangeCancel('10', 1),
      moved('15', 2),
      moved('25', 2),
      rangeCancel('20', 3),
    );

    expect(shown(series, LATE_NOVEMBER)).toEqual([
      ['2026-11-09T09:00:00.000Z', 'Report'],
      ['2026-11-15T15:00:00.000Z', 'Report presunutý'],
    ]);
  });

  it('restores older instance changes under a lifting range and keeps newer cancellations', () => {
    const series = seriesFrom(
      'daily@partner.test',
      daily,
      rangeCancel('03', 1),
      rangeRequest('05', 2, 'Report znova'),
      moved('08', 0),
      instanceCancel('06', 1),
      instanceCancel('07', 3),
    );

    expect(shown(series)).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-05T11:00:00.000Z', 'Report znova'],
      ['2026-11-06T11:00:00.000Z', 'Report znova'],
      ['2026-11-08T11:00:00.000Z', 'Report znova'],
      ['2026-11-09T11:00:00.000Z', 'Report znova'],
    ]);
  });

  it('applies a nominal DURATION of a range request in wall time across DST', () => {
    const spring = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20260301T080000Z',
        'SUMMARY:Služba',
        'DTSTART;TZID=Europe/Bratislava:20260320T090000',
        'DTEND;TZID=Europe/Bratislava:20260320T100000',
        'RRULE:FREQ=DAILY',
      ],
    );
    const allDayLong = vcalendar(
      'REQUEST',
      [],
      [
        UID,
        'DTSTAMP:20260302T080000Z',
        'SEQUENCE:1',
        'SUMMARY:Služba na celý deň',
        'RECURRENCE-ID;TZID=Europe/Bratislava;RANGE=THISANDFUTURE:20260325T090000',
        'DTSTART;TZID=Europe/Bratislava:20260325T100000',
        'DURATION:P1D',
      ],
    );
    const window = windowOf('2026-03-27T23:00:00Z', '2026-03-28T23:00:00Z');

    const occurrences = expander
      .expand(seriesFrom('daily@partner.test', spring, allDayLong), window)
      .map((occurrence) => [occurrence.start, occurrence.end]);

    expect(occurrences).toEqual([
      ['2026-03-27T09:00:00.000Z', '2026-03-28T09:00:00.000Z'],
      ['2026-03-28T09:00:00.000Z', '2026-03-29T08:00:00.000Z'],
    ]);
  });

  it('keeps a lift when the cut anchor is cancelled again on its own', () => {
    const cut = stored(present(parsedEvents(rangeCancel('03', 1))[0]));
    const recancelled = {
      ...cut,
      sequence: 3,
      rangeRevision: { sequence: cut.sequence, dtstamp: cut.dtstamp },
    };
    const base = seriesFrom(
      'daily@partner.test',
      daily,
      rangeRequest('05', 2, 'Report znova'),
      moved('07', 2),
    );

    expect(shown({ ...base, overrides: [recancelled, ...base.overrides] })).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Report'],
      ['2026-11-02T09:00:00.000Z', 'Report'],
      ['2026-11-05T11:00:00.000Z', 'Report znova'],
      ['2026-11-06T11:00:00.000Z', 'Report znova'],
      ['2026-11-07T15:00:00.000Z', 'Report presunutý'],
      ['2026-11-08T11:00:00.000Z', 'Report znova'],
      ['2026-11-09T11:00:00.000Z', 'Report znova'],
    ]);
  });
});

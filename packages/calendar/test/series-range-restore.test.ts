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

const rangeRequest = (day: string, sequence: number, summary: string) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261102T080000Z',
      `SEQUENCE:${String(sequence)}`,
      `SUMMARY:${summary}`,
      `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
      `DTSTART:202611${day}T110000Z`,
      `DTEND:202611${day}T113000Z`,
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

const shown = (series: ReturnType<typeof seriesFrom>) =>
  expander
    .expand(series, NOVEMBER)
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
});

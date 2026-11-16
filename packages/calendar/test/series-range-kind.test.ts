import { describe, expect, it } from 'vitest';
import { expander, rangeEndOf, seriesFrom, vcalendar, windowOf } from './support/series-ics';

const UID = 'UID:kind@partner.test';
const ZONE = 'Europe/Bratislava';

const rows = (series: ReturnType<typeof seriesFrom>, from: string, to: string) =>
  expander
    .expand(series, windowOf(from, to, ZONE))
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => [occurrence.start, occurrence.end, occurrence.allDay]);

const range = (...lines: string[]) =>
  vcalendar(
    'REQUEST',
    [],
    [UID, 'DTSTAMP:20261105T080000Z', 'SEQUENCE:1', 'SUMMARY:Zmena', ...lines],
  );

describe('THISANDFUTURE requests that change the all-day kind', () => {
  it('turns later timed occurrences into all-day days shifted in the master zone', () => {
    const nightly = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Nočná služba',
        `DTSTART;TZID=${ZONE}:20261120T003000`,
        `DTEND;TZID=${ZONE}:20261120T013000`,
        'RRULE:FREQ=DAILY',
      ],
    );
    const allDay = range(
      `RECURRENCE-ID;TZID=${ZONE};RANGE=THISANDFUTURE:20261123T003000`,
      'DTSTART;VALUE=DATE:20261124',
      'DTEND;VALUE=DATE:20261125',
    );

    expect(
      rows(
        seriesFrom('kind@partner.test', nightly, allDay),
        '2026-11-21T00:00:00Z',
        '2026-11-27T00:00:00Z',
      ),
    ).toEqual([
      ['2026-11-20T23:30:00.000Z', '2026-11-21T00:30:00.000Z', false],
      ['2026-11-21T23:30:00.000Z', '2026-11-22T00:30:00.000Z', false],
      ['2026-11-23T23:00:00.000Z', '2026-11-24T23:00:00.000Z', true],
      ['2026-11-24T23:00:00.000Z', '2026-11-25T23:00:00.000Z', true],
      ['2026-11-25T23:00:00.000Z', '2026-11-26T23:00:00.000Z', true],
      ['2026-11-26T23:00:00.000Z', '2026-11-27T23:00:00.000Z', true],
    ]);
  });

  it('gives later all-day occurrences the wall time of the range across the DST change', () => {
    const mondays = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20260201T080000Z',
        'SUMMARY:Inventúra',
        'DTSTART;VALUE=DATE:20260302',
        'DTEND;VALUE=DATE:20260303',
        'RRULE:FREQ=WEEKLY;COUNT=8',
      ],
    );
    const timed = range(
      'RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20260316',
      `DTSTART;TZID=${ZONE}:20260317T090000`,
      `DTEND;TZID=${ZONE}:20260317T100000`,
    );
    const series = seriesFrom('kind@partner.test', mondays, timed);

    expect(rows(series, '2026-03-01T00:00:00Z', '2026-05-01T00:00:00Z')).toEqual([
      ['2026-03-01T23:00:00.000Z', '2026-03-02T23:00:00.000Z', true],
      ['2026-03-08T23:00:00.000Z', '2026-03-09T23:00:00.000Z', true],
      ['2026-03-17T08:00:00.000Z', '2026-03-17T09:00:00.000Z', false],
      ['2026-03-24T08:00:00.000Z', '2026-03-24T09:00:00.000Z', false],
      ['2026-03-31T07:00:00.000Z', '2026-03-31T08:00:00.000Z', false],
      ['2026-04-07T07:00:00.000Z', '2026-04-07T08:00:00.000Z', false],
      ['2026-04-14T07:00:00.000Z', '2026-04-14T08:00:00.000Z', false],
      ['2026-04-21T07:00:00.000Z', '2026-04-21T08:00:00.000Z', false],
    ]);
    expect(rows(series, '2026-04-14T00:00:00Z', '2026-04-15T00:00:00Z')).toEqual([
      ['2026-04-14T07:00:00.000Z', '2026-04-14T08:00:00.000Z', false],
    ]);
    expect(Date.parse(rangeEndOf(series) ?? '')).toBeGreaterThan(
      Date.parse('2026-04-21T08:00:00.000Z'),
    );
  });

  it('takes the day of a UTC RDATE occurrence in the master zone', () => {
    const evenings = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Večer',
        'DTSTART;TZID=America/New_York:20261102T210000',
        'DTEND;TZID=America/New_York:20261102T220000',
        'RRULE:FREQ=DAILY;COUNT=2',
        'RDATE:20261105T020000Z',
      ],
    );
    const allDay = range(
      'RECURRENCE-ID;TZID=America/New_York;RANGE=THISANDFUTURE:20261103T210000',
      'DTSTART;VALUE=DATE:20261103',
      'DTEND;VALUE=DATE:20261104',
    );
    const days = expander
      .expand(
        seriesFrom('kind@partner.test', evenings, allDay),
        windowOf('2026-11-03T00:00:00Z', '2026-11-08T00:00:00Z', 'UTC'),
      )
      .map((occurrence) => [occurrence.start, occurrence.allDay]);

    expect(days).toEqual([
      ['2026-11-03T02:00:00.000Z', false],
      ['2026-11-03T00:00:00.000Z', true],
      ['2026-11-04T00:00:00.000Z', true],
    ]);
  });
});

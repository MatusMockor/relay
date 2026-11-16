import { describe, expect, it } from 'vitest';
import { IcalCalendarExpander, IcalCalendarParser } from '../src';
import { present, seriesOf } from './support/fixtures';

const parser = new IcalCalendarParser();
const expander = new IcalCalendarExpander();

const calendar = (...lines: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relay//Test//EN',
    'BEGIN:VEVENT',
    'UID:p@test',
    'DTSTAMP:20261101T000000Z',
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const spans = (text: string, from: string, to: string, timeZone = 'UTC') => {
  const parsed = present(parser.parse(text));
  return expander
    .expand(seriesOf(parsed.events, 'p@test'), { from, to, timeZone })
    .map(({ start, end }) => ({ start, end }));
};

describe('RDATE PERIOD values', () => {
  it('keeps the length of each period instead of the master duration', () => {
    const occurrences = spans(
      calendar(
        'DTSTART:20261101T090000Z',
        'DTEND:20261101T100000Z',
        'RDATE;VALUE=PERIOD:20261102T090000Z/20261102T120000Z,20261103T140000Z/PT30M',
        'RDATE:20261104T090000Z',
      ),
      '2026-11-01T00:00:00Z',
      '2026-11-05T00:00:00Z',
    );

    expect(occurrences).toEqual([
      { start: '2026-11-01T09:00:00.000Z', end: '2026-11-01T10:00:00.000Z' },
      { start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T12:00:00.000Z' },
      { start: '2026-11-03T14:00:00.000Z', end: '2026-11-03T14:30:00.000Z' },
      { start: '2026-11-04T09:00:00.000Z', end: '2026-11-04T10:00:00.000Z' },
    ]);
  });

  it('keeps zoned period lengths after a DST change', () => {
    const occurrences = spans(
      calendar(
        'DTSTART;TZID=Europe/Bratislava:20261020T090000',
        'DTEND;TZID=Europe/Bratislava:20261020T100000',
        'RDATE;VALUE=PERIOD;TZID=Europe/Bratislava:20261026T090000/20261026T113000',
      ),
      '2026-10-19T00:00:00Z',
      '2026-10-28T00:00:00Z',
      'Europe/Bratislava',
    );

    expect(occurrences).toEqual([
      { start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T08:00:00.000Z' },
      { start: '2026-10-26T08:00:00.000Z', end: '2026-10-26T10:30:00.000Z' },
    ]);
  });

  it('extends the stored series range to the end of the longest period', () => {
    const parsed = present(
      parser.parse(
        calendar(
          'DTSTART:20261101T090000Z',
          'DTEND:20261101T100000Z',
          'RDATE;VALUE=PERIOD:20261110T090000Z/20261114T090000Z',
        ),
      ),
    );

    const [event] = parsed.events;
    expect(Date.parse(event?.rangeEndsAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse('2026-11-14T09:00:00.000Z'),
    );
    expect(event?.ics).toContain('RDATE:20261110T090000Z');
  });
});

describe('zoned RDATE PERIOD values across a DST change', () => {
  it('measures the period between real instants', () => {
    const occurrences = spans(
      calendar(
        'DTSTART;TZID=Europe/Bratislava:20261020T013000',
        'DTEND;TZID=Europe/Bratislava:20261020T023000',
        'RDATE;VALUE=PERIOD;TZID=Europe/Bratislava:20261025T013000/20261025T033000',
      ),
      '2026-10-24T00:00:00Z',
      '2026-10-26T00:00:00Z',
      'Europe/Bratislava',
    );

    expect(occurrences).toEqual([
      { start: '2026-10-24T23:30:00.000Z', end: '2026-10-25T02:30:00.000Z' },
    ]);
  });
});

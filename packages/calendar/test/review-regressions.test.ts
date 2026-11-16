import { describe, expect, it } from 'vitest';
import { IcalCalendarExpander, IcalCalendarParser } from '../src';
import { present, seriesOf } from './support/fixtures';

const parser = new IcalCalendarParser();
const expander = new IcalCalendarExpander();

const calendar = (method: string | null, ...lines: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relay//Test//EN',
    ...(method === null ? [] : [`METHOD:${method}`]),
    'BEGIN:VEVENT',
    'UID:r@test',
    'DTSTAMP:20261101T000000Z',
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const expand = (text: string, from: string, to: string, timeZone = 'UTC') => {
  const parsed = present(parser.parse(text));
  return expander.expand(seriesOf(parsed.events, 'r@test'), { from, to, timeZone });
};

describe('review regressions', () => {
  it('compares UNTIL and EXDATE in the IANA zone of a DTSTART without VTIMEZONE', () => {
    const until = expand(
      calendar(
        null,
        'DTSTART;TZID=America/New_York:20261030T090000',
        'DURATION:PT1H',
        'RRULE:FREQ=DAILY;UNTIL=20261102T120000Z',
      ),
      '2026-10-30T00:00:00Z',
      '2026-11-05T00:00:00Z',
    );
    expect(until.map((occurrence) => occurrence.start)).toEqual([
      '2026-10-30T13:00:00.000Z',
      '2026-10-31T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
    ]);
    const excluded = expand(
      calendar(
        null,
        'DTSTART;TZID=America/New_York:20261030T090000',
        'DURATION:PT1H',
        'RRULE:FREQ=DAILY;COUNT=4',
        'EXDATE:20261102T140000Z',
      ),
      '2026-10-30T00:00:00Z',
      '2026-11-05T00:00:00Z',
    );
    expect(excluded.map((occurrence) => occurrence.start)).not.toContain(
      '2026-11-02T14:00:00.000Z',
    );
    expect(excluded).toHaveLength(3);
  });

  it('expands frequent series far from DTSTART', () => {
    const occurrences = expand(
      calendar(
        null,
        'DTSTART:20260101T000000Z',
        'DURATION:PT1M',
        'RRULE:FREQ=MINUTELY;INTERVAL=15',
      ),
      '2026-11-16T10:00:00Z',
      '2026-11-16T11:00:00Z',
    );
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:15:00.000Z',
      '2026-11-16T10:30:00.000Z',
      '2026-11-16T10:45:00.000Z',
    ]);
  });

  it('keeps recurring all-day events and nominal durations at local midnight across DST', () => {
    const occurrences = expand(
      calendar(
        null,
        'DTSTART;VALUE=DATE:20261024',
        'DTEND;VALUE=DATE:20261025',
        'RRULE:FREQ=DAILY;COUNT=3',
      ),
      '2026-10-23T00:00:00Z',
      '2026-10-28T00:00:00Z',
      'Europe/Bratislava',
    );
    expect(occurrences.map((occurrence) => [occurrence.start, occurrence.end])).toEqual([
      ['2026-10-23T22:00:00.000Z', '2026-10-24T22:00:00.000Z'],
      ['2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
      ['2026-10-25T23:00:00.000Z', '2026-10-26T23:00:00.000Z'],
    ]);
  });

  it('keeps the series when RDATE uses PERIOD values', () => {
    const occurrences = expand(
      calendar(
        null,
        'DTSTART:20261101T090000Z',
        'DTEND:20261101T100000Z',
        'RDATE;VALUE=PERIOD:20261102T090000Z/20261102T120000Z',
      ),
      '2026-11-01T00:00:00Z',
      '2026-11-03T00:00:00Z',
    );
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
  });

  it('accepts CANCEL and REPLY without DTSTART as untimed scheduling messages', () => {
    const cancel = present(parser.parse(calendar('CANCEL', 'SEQUENCE:2', 'STATUS:CANCELLED')));
    expect(cancel.events).toEqual([
      expect.objectContaining({ uid: 'r@test', timed: false, sequence: 2, status: 'cancelled' }),
    ]);
    const reply = present(
      parser.parse(calendar('REPLY', 'ATTENDEE;PARTSTAT=DECLINED:mailto:jana@partner.test')),
    );
    expect(reply.events[0]).toMatchObject({
      timed: false,
      attendees: [{ email: 'jana@partner.test', partstat: 'declined' }],
    });
    expect(present(parser.parse(calendar('REQUEST', 'SUMMARY:x'))).events).toEqual([]);
  });
});

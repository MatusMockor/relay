import { describe, expect, it } from 'vitest';
import { present } from './support/fixtures';
import {
  CENTRAL_EUROPE,
  expander,
  parsedEvents,
  rangeEndOf,
  seriesFrom,
  startsOf,
  vcalendar,
  windowOf,
} from './support/series-ics';

const UID = 'UID:series@corp.test';
const STAMP = 'DTSTAMP:20261101T080000Z';
const CUT_STAMP = 'DTSTAMP:20261110T080000Z';

const outlookSeries = vcalendar('REQUEST', CENTRAL_EUROPE, [
  UID,
  STAMP,
  'SEQUENCE:0',
  'SUMMARY:Týždenná porada',
  'DTSTART;TZID=Central Europe Standard Time:20261102T100000',
  'DTEND;TZID=Central Europe Standard Time:20261102T110000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO',
]);

const movedInstance = (day: string, sequence: number) =>
  vcalendar('REQUEST', CENTRAL_EUROPE, [
    UID,
    STAMP,
    `SEQUENCE:${String(sequence)}`,
    'SUMMARY:Týždenná porada (posunutá)',
    `RECURRENCE-ID;TZID=Central Europe Standard Time:${day}T100000`,
    `DTSTART;TZID=Central Europe Standard Time:${day}T140000`,
    `DTEND;TZID=Central Europe Standard Time:${day}T150000`,
  ]);

const cancelFrom = (recurrenceId: string, sequence = 1, zones = CENTRAL_EUROPE) =>
  vcalendar('CANCEL', zones, [
    UID,
    CUT_STAMP,
    `SEQUENCE:${String(sequence)}`,
    'STATUS:CANCELLED',
    recurrenceId,
  ]);

const OUTLOOK_CUT =
  'RECURRENCE-ID;TZID=Central Europe Standard Time;RANGE=THISANDFUTURE:20261123T100000';

const utcSeries = (...rule: string[]) =>
  vcalendar(null, [], [UID, STAMP, 'DTSTART:20261101T090000Z', 'DTEND:20261101T100000Z', ...rule]);

const UTC_NOVEMBER = windowOf('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 'UTC');

describe('RECURRENCE-ID;RANGE=THISANDFUTURE cancellations', () => {
  it('parses the range and keeps it in the stored ICS', () => {
    const [cancel] = parsedEvents(cancelFrom(OUTLOOK_CUT));
    expect(cancel).toMatchObject({
      recurrenceId: '2026-11-23T09:00:00.000Z',
      thisAndFuture: true,
      status: 'cancelled',
      sequence: 1,
    });
    expect(present(cancel).ics).toContain('RANGE=THISANDFUTURE');
    const [instance] = parsedEvents(movedInstance('20261130', 0));
    expect(instance).not.toHaveProperty('thisAndFuture');
  });

  it('ends an Outlook series before the cut and drops older overrides after it', () => {
    const series = seriesFrom(
      'series@corp.test',
      outlookSeries,
      movedInstance('20261109', 0),
      movedInstance('20261130', 0),
      cancelFrom(OUTLOOK_CUT),
    );

    expect(startsOf(series, windowOf('2026-11-01T00:00:00Z', '2027-02-01T00:00:00Z'))).toEqual([
      '2026-11-02T09:00:00.000Z',
      '2026-11-09T13:00:00.000Z',
      '2026-11-16T09:00:00.000Z',
    ]);
    expect(rangeEndOf(series)).toBe('2026-11-24T10:00:00.000Z');
  });

  it('keeps an instance sent again after the cancellation', () => {
    const series = seriesFrom(
      'series@corp.test',
      outlookSeries,
      cancelFrom(OUTLOOK_CUT),
      movedInstance('20261207', 2),
    );

    expect(startsOf(series, windowOf('2026-11-20T00:00:00Z', '2027-01-01T00:00:00Z'))).toEqual([
      '2026-12-07T13:00:00.000Z',
    ]);
  });

  it('ignores a cancellation older than the series and one at the first occurrence ends it', () => {
    const updated = vcalendar('REQUEST', CENTRAL_EUROPE, [
      UID,
      'DTSTAMP:20261112T080000Z',
      'SEQUENCE:2',
      'SUMMARY:Týždenná porada',
      'DTSTART;TZID=Central Europe Standard Time:20261102T100000',
      'DTEND;TZID=Central Europe Standard Time:20261102T110000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
    ]);
    const window = windowOf('2026-11-24T00:00:00Z', '2026-12-15T00:00:00Z');

    const stale = seriesFrom('series@corp.test', updated, cancelFrom(OUTLOOK_CUT));
    expect(startsOf(stale, window)).toEqual([
      '2026-11-30T09:00:00.000Z',
      '2026-12-07T09:00:00.000Z',
      '2026-12-14T09:00:00.000Z',
    ]);
    expect(rangeEndOf(stale)).toBeNull();

    const fromStart = seriesFrom(
      'series@corp.test',
      outlookSeries,
      cancelFrom(
        'RECURRENCE-ID;TZID=Central Europe Standard Time;RANGE=THISANDFUTURE:20261102T100000',
      ),
    );
    expect(startsOf(fromStart, windowOf('2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z'))).toEqual(
      [],
    );
  });

  it('honours COUNT and an earlier UNTIL', () => {
    const counted = seriesFrom(
      'series@corp.test',
      utcSeries('RRULE:FREQ=DAILY;COUNT=10'),
      cancelFrom('RECURRENCE-ID;RANGE=THISANDFUTURE:20261104T090000Z', 1, []),
    );
    expect(startsOf(counted, UTC_NOVEMBER)).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-03T09:00:00.000Z',
    ]);
    expect(rangeEndOf(counted)).toBe('2026-11-05T10:00:00.000Z');

    const until = seriesFrom(
      'series@corp.test',
      utcSeries('RRULE:FREQ=DAILY;UNTIL=20261102T090000Z'),
      cancelFrom('RECURRENCE-ID;RANGE=THISANDFUTURE:20261106T090000Z', 1, []),
    );
    expect(startsOf(until, UTC_NOVEMBER)).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
    expect(rangeEndOf(until)).toBe('2026-11-03T10:00:00.000Z');
  });

  it('drops RDATE periods and keeps EXDATE before the cut', () => {
    const series = seriesFrom(
      'series@corp.test',
      utcSeries(
        'RRULE:FREQ=DAILY;COUNT=4',
        'EXDATE:20261102T090000Z',
        'RDATE;VALUE=PERIOD:20261103T140000Z/PT3H,20261106T090000Z/PT2H',
      ),
      cancelFrom('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T140000Z', 1, []),
    );

    expect(
      expander.expand(series, UTC_NOVEMBER).map((occurrence) => [occurrence.start, occurrence.end]),
    ).toEqual([
      ['2026-11-01T09:00:00.000Z', '2026-11-01T10:00:00.000Z'],
      ['2026-11-03T09:00:00.000Z', '2026-11-03T10:00:00.000Z'],
    ]);
    expect(rangeEndOf(series)).toBe('2026-11-04T17:00:00.000Z');
  });

  it('cuts all-day and floating series in the viewer zone', () => {
    const allDay = seriesFrom(
      'series@corp.test',
      vcalendar(null, [], [UID, STAMP, 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=DAILY']),
      cancelFrom('RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20261119', 1, []),
    );
    expect(startsOf(allDay, windowOf('2026-11-15T23:00:00Z', '2026-11-30T23:00:00Z'))).toEqual([
      '2026-11-15T23:00:00.000Z',
      '2026-11-16T23:00:00.000Z',
      '2026-11-17T23:00:00.000Z',
    ]);
    expect(rangeEndOf(allDay)).toBe('2026-11-21T00:00:00.000Z');

    const floating = seriesFrom(
      'series@corp.test',
      vcalendar(
        null,
        [],
        [UID, STAMP, 'DTSTART:20261101T090000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY'],
      ),
      cancelFrom('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000', 1, []),
    );
    expect(startsOf(floating, windowOf('2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'))).toEqual([
      '2026-11-01T08:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
    ]);
  });

  it('hides older instances after the cut when the series itself is unknown', () => {
    const series = seriesFrom(
      'series@corp.test',
      movedInstance('20261109', 0),
      movedInstance('20261130', 0),
      cancelFrom(OUTLOOK_CUT),
    );

    expect(startsOf(series, windowOf('2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z'))).toEqual([
      '2026-11-09T13:00:00.000Z',
    ]);
  });
});

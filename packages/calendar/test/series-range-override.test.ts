import { describe, expect, it } from 'vitest';
import { IcalReplyBuilder } from '../src';
import { present, stored } from './support/fixtures';
import {
  expander,
  parsedEvents,
  rangeEndOf,
  seriesFrom,
  vcalendar,
  windowOf,
} from './support/series-ics';

const UID = 'UID:porada@partner.test';
const ZONE = 'Europe/Bratislava';

const weekly = vcalendar(
  null,
  [],
  [
    UID,
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    'SUMMARY:Porada',
    'LOCATION:Zasadačka A',
    `DTSTART;TZID=${ZONE}:20261102T100000`,
    `DTEND;TZID=${ZONE}:20261102T110000`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
  ],
);

interface Change {
  readonly recurrenceId: string;
  readonly start: string;
  readonly end: string;
  readonly sequence: number;
  readonly summary: string;
  readonly status?: string;
}

const change = ({ recurrenceId, start, end, sequence, summary, status }: Change) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261105T080000Z',
      `SEQUENCE:${String(sequence)}`,
      `SUMMARY:${summary}`,
      'LOCATION:Zasadačka B',
      recurrenceId,
      start,
      end,
      ...(status === undefined ? [] : [`STATUS:${status}`]),
    ],
  );

const FROM_16TH = change({
  recurrenceId: `RECURRENCE-ID;TZID=${ZONE};RANGE=THISANDFUTURE:20261116T100000`,
  start: `DTSTART;TZID=${ZONE}:20261116T113000`,
  end: `DTEND;TZID=${ZONE}:20261116T130000`,
  sequence: 1,
  summary: 'Porada (nový čas)',
});

const instance = (day: string, sequence: number, summary: string, status?: string) =>
  change({
    recurrenceId: `RECURRENCE-ID;TZID=${ZONE}:${day}T100000`,
    start: `DTSTART;TZID=${ZONE}:${day}T150000`,
    end: `DTEND;TZID=${ZONE}:${day}T160000`,
    sequence,
    summary,
    ...(status === undefined ? {} : { status }),
  });

const rows = (series: ReturnType<typeof seriesFrom>, from: string, to: string, zone = ZONE) =>
  expander
    .expand(series, windowOf(from, to, zone))
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => [occurrence.start, occurrence.end, occurrence.event.summary]);

describe('RECURRENCE-ID;RANGE=THISANDFUTURE requests', () => {
  it('shifts and renames this and all later occurrences', () => {
    expect(parsedEvents(FROM_16TH)[0]).toMatchObject({ thisAndFuture: true, sequence: 1 });
    const series = seriesFrom(
      'porada@partner.test',
      weekly,
      FROM_16TH,
      instance('20261123', 0, 'Porada (stará výnimka)'),
      instance('20261130', 2, 'Porada (presunutá)'),
      instance('20261207', 0, 'Porada (zrušená)', 'CANCELLED'),
    );

    expect(rows(series, '2026-11-01T00:00:00Z', '2026-12-15T00:00:00Z')).toEqual([
      ['2026-11-02T09:00:00.000Z', '2026-11-02T10:00:00.000Z', 'Porada'],
      ['2026-11-09T09:00:00.000Z', '2026-11-09T10:00:00.000Z', 'Porada'],
      ['2026-11-16T10:30:00.000Z', '2026-11-16T12:00:00.000Z', 'Porada (nový čas)'],
      ['2026-11-23T10:30:00.000Z', '2026-11-23T12:00:00.000Z', 'Porada (nový čas)'],
      ['2026-11-30T14:00:00.000Z', '2026-11-30T15:00:00.000Z', 'Porada (presunutá)'],
      ['2026-12-14T10:30:00.000Z', '2026-12-14T12:00:00.000Z', 'Porada (nový čas)'],
    ]);
    const derived = expander
      .expand(series, windowOf('2026-12-14T00:00:00Z', '2026-12-15T00:00:00Z', ZONE))
      .at(0);
    expect(derived).toMatchObject({
      recurrenceId: '2026-12-14T09:00:00.000Z',
      event: { location: 'Zasadačka B', recurrenceId: '2026-11-16T09:00:00.000Z' },
    });
  });

  it('keeps the wall-clock shift across the DST change', () => {
    const series = seriesFrom('porada@partner.test', weekly, FROM_16TH);

    expect(rows(series, '2027-03-22T00:00:00Z', '2027-03-30T00:00:00Z')).toEqual([
      ['2027-03-22T10:30:00.000Z', '2027-03-22T12:00:00.000Z', 'Porada (nový čas)'],
      ['2027-03-29T09:30:00.000Z', '2027-03-29T11:00:00.000Z', 'Porada (nový čas)'],
    ]);
  });

  it('measures the shift in wall time when the change crosses the DST change', () => {
    const night = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20260301T080000Z',
        'SUMMARY:Záloha',
        `DTSTART;TZID=${ZONE}:20260322T013000`,
        `DTEND;TZID=${ZONE}:20260322T020000`,
        'RRULE:FREQ=WEEKLY',
      ],
    );
    const later = change({
      recurrenceId: `RECURRENCE-ID;TZID=${ZONE};RANGE=THISANDFUTURE:20260329T013000`,
      start: `DTSTART;TZID=${ZONE}:20260329T033000`,
      end: `DTEND;TZID=${ZONE}:20260329T040000`,
      sequence: 1,
      summary: 'Záloha o 3:30',
    });

    expect(
      rows(
        seriesFrom('porada@partner.test', night, later),
        '2026-03-22T00:00:00Z',
        '2026-04-06T00:00:00Z',
      ),
    ).toEqual([
      ['2026-03-22T00:30:00.000Z', '2026-03-22T01:00:00.000Z', 'Záloha'],
      ['2026-03-29T01:30:00.000Z', '2026-03-29T02:00:00.000Z', 'Záloha o 3:30'],
      ['2026-04-05T01:30:00.000Z', '2026-04-05T02:00:00.000Z', 'Záloha o 3:30'],
    ]);
  });

  it('finds occurrences shifted into the window from far before or after it', () => {
    const daily = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Denný report',
        'DTSTART:20261101T090000Z',
        'DTEND:20261101T100000Z',
        'RRULE:FREQ=DAILY',
      ],
    );
    const later = change({
      recurrenceId: 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261110T090000Z',
      start: 'DTSTART:20261120T090000Z',
      end: 'DTEND:20261120T100000Z',
      sequence: 1,
      summary: 'O desať dní neskôr',
    });
    const earlier = change({
      recurrenceId: 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261110T090000Z',
      start: 'DTSTART:20261105T090000Z',
      end: 'DTEND:20261105T100000Z',
      sequence: 1,
      summary: 'O päť dní skôr',
    });

    expect(
      rows(
        seriesFrom('porada@partner.test', daily, later),
        '2026-12-20T00:00:00Z',
        '2026-12-21T00:00:00Z',
        'UTC',
      ),
    ).toEqual([['2026-12-20T09:00:00.000Z', '2026-12-20T10:00:00.000Z', 'O desať dní neskôr']]);
    expect(
      rows(
        seriesFrom('porada@partner.test', daily, earlier),
        '2026-12-20T00:00:00Z',
        '2026-12-21T00:00:00Z',
        'UTC',
      ),
    ).toEqual([['2026-12-20T09:00:00.000Z', '2026-12-20T10:00:00.000Z', 'O päť dní skôr']]);
  });

  it('moves all-day occurrences by whole days', () => {
    const allDay = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Služba',
        'DTSTART;VALUE=DATE:20261116',
        'RRULE:FREQ=WEEKLY',
      ],
    );
    const moved = change({
      recurrenceId: 'RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20261123',
      start: 'DTSTART;VALUE=DATE:20261124',
      end: 'DTEND;VALUE=DATE:20261126',
      sequence: 1,
      summary: 'Služba (utorok a streda)',
    });

    expect(
      rows(
        seriesFrom('porada@partner.test', allDay, moved),
        '2026-11-15T23:00:00Z',
        '2026-12-06T23:00:00Z',
      ),
    ).toEqual([
      ['2026-11-15T23:00:00.000Z', '2026-11-16T23:00:00.000Z', 'Služba'],
      ['2026-11-23T23:00:00.000Z', '2026-11-25T23:00:00.000Z', 'Služba (utorok a streda)'],
      ['2026-11-30T23:00:00.000Z', '2026-12-02T23:00:00.000Z', 'Služba (utorok a streda)'],
    ]);
  });

  it('lets the newest range win and stops at a later range cancellation', () => {
    const older = change({
      recurrenceId: `RECURRENCE-ID;TZID=${ZONE};RANGE=THISANDFUTURE:20261123T100000`,
      start: `DTSTART;TZID=${ZONE}:20261123T080000`,
      end: `DTEND;TZID=${ZONE}:20261123T090000`,
      sequence: 0,
      summary: 'Porada (staré ráno)',
    });
    const cancel = vcalendar(
      'CANCEL',
      [],
      [
        UID,
        'DTSTAMP:20261106T080000Z',
        'SEQUENCE:2',
        `RECURRENCE-ID;TZID=${ZONE};RANGE=THISANDFUTURE:20261207T100000`,
      ],
    );
    const series = seriesFrom('porada@partner.test', weekly, FROM_16TH, older, cancel);

    expect(
      rows(series, '2026-11-20T00:00:00Z', '2027-01-01T00:00:00Z').map(([start]) => start),
    ).toEqual(['2026-11-23T10:30:00.000Z', '2026-11-30T10:30:00.000Z']);
  });

  it('widens the stored range of a finite series by the shift', () => {
    const counted = vcalendar(
      null,
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Školenie',
        'DTSTART:20261101T090000Z',
        'DTEND:20261101T100000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
      ],
    );
    const shifted = change({
      recurrenceId: 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z',
      start: 'DTSTART:20261105T090000Z',
      end: 'DTEND:20261105T100000Z',
      sequence: 1,
      summary: 'Školenie (o dva dni)',
    });
    const series = seriesFrom('porada@partner.test', counted, shifted);

    expect(
      rows(series, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 'UTC').map(([start]) => start),
    ).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-05T09:00:00.000Z',
      '2026-11-06T09:00:00.000Z',
      '2026-11-07T09:00:00.000Z',
    ]);
    expect(rangeEndOf(series)).toBe('2026-11-08T10:00:00.000Z');
    expect(rangeEndOf(seriesFrom('porada@partner.test', counted))).toBe(
      parsedEvents(counted)[0]?.rangeEndsAt,
    );
  });

  it('answers a range request with a REPLY for the same recurrence range', () => {
    const range = stored(present(parsedEvents(FROM_16TH)[0]));
    const reply = new IcalReplyBuilder().build({
      event: range,
      attendee: { name: null, email: 'jana@example.com' },
      response: 'accepted',
      dtstamp: '2026-11-06T08:00:00.000Z',
    });

    expect(parsedEvents(reply)[0]).toMatchObject({
      recurrenceId: '2026-11-16T09:00:00.000Z',
      thisAndFuture: true,
      sequence: 1,
      attendees: [{ email: 'jana@example.com', partstat: 'accepted' }],
    });
  });
});

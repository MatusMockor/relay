import { describe, expect, it } from 'vitest';
import { present } from './support/fixtures';
import { expander, seriesFrom, vcalendar, windowOf } from './support/series-ics';

const UID = 'UID:tombstone@partner.test';
const NOVEMBER = windowOf('2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z', 'UTC');

const moved = (day: string, stamp: string) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      `DTSTAMP:${stamp}`,
      'SEQUENCE:3',
      `SUMMARY:Porada ${day}.`,
      `RECURRENCE-ID:202611${day}T090000Z`,
      `DTSTART:202611${day}T140000Z`,
      `DTEND:202611${day}T150000Z`,
    ],
  );

const wholeSeriesCancel = vcalendar(
  'CANCEL',
  [],
  [UID, 'DTSTAMP:20261110T080000Z', 'SEQUENCE:1', 'STATUS:CANCELLED'],
);

const single = (...extra: string[]) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261101T080000Z',
      'SEQUENCE:0',
      'SUMMARY:Porada',
      'DTSTART:20261102T090000Z',
      'DTEND:20261102T100000Z',
      ...extra,
    ],
  );

const shown = (series: ReturnType<typeof seriesFrom>) =>
  expander
    .expand(series, NOVEMBER)
    .map((occurrence) => `${occurrence.start.slice(5, 16)} ${occurrence.event.status}`);

describe('series known only from instance invitations', () => {
  it('hides older instances under a cancelled master without RRULE and keeps later ones', () => {
    const series = seriesFrom(
      'tombstone@partner.test',
      moved('09', '20261105T080000Z'),
      wholeSeriesCancel,
      moved('16', '20261111T080000Z'),
    );

    expect(present(series.master)).toMatchObject({ status: 'cancelled', recurring: false });
    expect(shown(series)).toEqual(['11-16T14:00 confirmed']);
    expect(shown(seriesFrom('tombstone@partner.test', wholeSeriesCancel))).toEqual([]);
  });

  it('cancels a single event cut at its start', () => {
    const cut = vcalendar(
      'CANCEL',
      [],
      [
        UID,
        'DTSTAMP:20261103T080000Z',
        'SEQUENCE:1',
        'RECURRENCE-ID;RANGE=THISANDFUTURE:20261102T090000Z',
      ],
    );

    expect(shown(seriesFrom('tombstone@partner.test', single(), cut))).toEqual([
      '11-02T09:00 cancelled',
    ]);
    const floating = vcalendar(
      'REQUEST',
      [],
      [
        UID,
        'DTSTAMP:20261101T080000Z',
        'SUMMARY:Porada',
        'DTSTART:20261102T090000',
        'DTEND:20261102T100000',
      ],
    );
    const allDay = vcalendar(
      'REQUEST',
      [],
      [UID, 'DTSTAMP:20261101T080000Z', 'SUMMARY:Porada', 'DTSTART;VALUE=DATE:20261102'],
    );
    const cutAt = (recurrenceId: string) =>
      vcalendar('CANCEL', [], [UID, 'DTSTAMP:20261103T080000Z', 'SEQUENCE:1', recurrenceId]);
    const statuses = (series: ReturnType<typeof seriesFrom>) =>
      expander
        .expand(
          series,
          windowOf('2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z', 'America/New_York'),
        )
        .map((occurrence) => occurrence.event.status);

    expect(
      statuses(
        seriesFrom(
          'tombstone@partner.test',
          floating,
          cutAt('RECURRENCE-ID;RANGE=THISANDFUTURE:20261102T090000'),
        ),
      ),
    ).toEqual(['cancelled']);
    expect(
      statuses(
        seriesFrom(
          'tombstone@partner.test',
          allDay,
          cutAt('RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20261102'),
        ),
      ),
    ).toEqual(['cancelled']);
  });
});

describe('series membership through the expander', () => {
  it('reports an older override that is no longer an occurrence of the master', () => {
    const series = seriesFrom(
      'tombstone@partner.test',
      single('RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE:20261109T090000Z'),
      moved('09', '20261031T080000Z'),
      moved('16', '20261031T080000Z'),
    );
    const master = present(series.master);
    const [ninth, sixteenth] = series.overrides;

    expect(expander.isOrphaned(master, present(ninth))).toBe(true);
    expect(expander.isOrphaned(master, present(sixteenth))).toBe(false);
    expect(
      expander.isOrphaned(master, { ...present(ninth), dtstamp: '2026-11-02T08:00:00.000Z' }),
    ).toBe(false);
    expect(
      expander.isOrphaned(present(seriesFrom('tombstone@partner.test', single()).master), master),
    ).toBe(false);
  });
});

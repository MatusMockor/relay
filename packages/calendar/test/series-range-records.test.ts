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

const UID = 'UID:standup@partner.test';
const NOVEMBER = windowOf('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z', 'UTC');

const daily = vcalendar(
  null,
  [],
  [
    UID,
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    'SUMMARY:Standup',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T091500Z',
    'RRULE:FREQ=DAILY',
  ],
);

const rangeRequest = (sequence: number) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261102T080000Z',
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Standup o 10:00',
      'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z',
      'DTSTART:20261103T100000Z',
      'DTEND:20261103T101500Z',
    ],
  );

const rangeCancel = (sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      'DTSTAMP:20261102T090000Z',
      `SEQUENCE:${String(sequence)}`,
      'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z',
    ],
  );

const instanceRequest = (sequence: number) =>
  vcalendar(
    'REQUEST',
    [],
    [
      UID,
      'DTSTAMP:20261102T100000Z',
      `SEQUENCE:${String(sequence)}`,
      'SUMMARY:Standup iba raz',
      'RECURRENCE-ID:20261103T090000Z',
      'DTSTART:20261103T140000Z',
      'DTEND:20261103T141500Z',
    ],
  );

const instanceCancel = (sequence: number) =>
  vcalendar(
    'CANCEL',
    [],
    [
      UID,
      'DTSTAMP:20261102T110000Z',
      `SEQUENCE:${String(sequence)}`,
      'RECURRENCE-ID:20261103T090000Z',
    ],
  );

const shown = (...texts: string[]) =>
  expander
    .expand(seriesFrom('standup@partner.test', daily, ...texts), NOVEMBER)
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => [occurrence.start, occurrence.event.summary]);

describe('THISANDFUTURE records next to an exact instance at the same recurrence id', () => {
  it('restores only the instance a newer REQUEST sends again at the cut', () => {
    const before = [
      ['2026-11-01T09:00:00.000Z', 'Standup'],
      ['2026-11-02T09:00:00.000Z', 'Standup'],
    ];

    expect(shown(rangeCancel(1), instanceRequest(2))).toEqual([
      ...before,
      ['2026-11-03T14:00:00.000Z', 'Standup iba raz'],
    ]);
    expect(shown(rangeCancel(2), instanceRequest(1))).toEqual(before);
    expect(
      rangeEndOf(seriesFrom('standup@partner.test', daily, rangeCancel(1), instanceRequest(2))),
    ).toBe('2026-11-04T09:15:00.000Z');
  });

  it('changes only the anchor for a newer plain REQUEST and keeps the range for later days', () => {
    expect(shown(rangeRequest(1), instanceRequest(2))).toEqual([
      ['2026-11-01T09:00:00.000Z', 'Standup'],
      ['2026-11-02T09:00:00.000Z', 'Standup'],
      ['2026-11-03T14:00:00.000Z', 'Standup iba raz'],
      ['2026-11-04T10:00:00.000Z', 'Standup o 10:00'],
      ['2026-11-05T10:00:00.000Z', 'Standup o 10:00'],
      ['2026-11-06T10:00:00.000Z', 'Standup o 10:00'],
      ['2026-11-07T10:00:00.000Z', 'Standup o 10:00'],
    ]);
    expect(shown(rangeRequest(2), instanceRequest(1)).slice(2, 4)).toEqual([
      ['2026-11-03T10:00:00.000Z', 'Standup o 10:00'],
      ['2026-11-04T10:00:00.000Z', 'Standup o 10:00'],
    ]);
  });

  it('answers a derived occurrence of a range whose anchor alone is cancelled', () => {
    const series = seriesFrom('standup@partner.test', daily, rangeRequest(1), instanceCancel(2));
    const occurrences = expander.expand(series, NOVEMBER);
    const anchor = occurrences.filter(
      (occurrence) =>
        occurrence.recurrenceId === '2026-11-03T09:00:00.000Z' &&
        occurrence.event.status !== 'cancelled',
    );
    const derived = present(
      occurrences.find((occurrence) => occurrence.recurrenceId === '2026-11-05T09:00:00.000Z'),
    );

    expect(anchor).toEqual([]);
    expect(derived.event).toMatchObject({ status: 'confirmed', thisAndFuture: true, sequence: 1 });
    const reply = new IcalReplyBuilder().build({
      event: derived.event,
      attendee: { name: 'Jana', email: 'jana@example.com' },
      response: 'accepted',
      dtstamp: '2026-11-04T08:00:00.000Z',
    });

    expect(reply).toContain('RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z');
    expect(parsedEvents(reply)[0]).toMatchObject({
      recurrenceId: '2026-11-03T09:00:00.000Z',
      thisAndFuture: true,
      sequence: 1,
      attendees: [{ email: 'jana@example.com', partstat: 'accepted' }],
    });
  });
});

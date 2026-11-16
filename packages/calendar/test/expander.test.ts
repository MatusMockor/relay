import { describe, expect, it } from 'vitest';
import { IcalCalendarExpander } from '../src';
import { parseFixture, seriesOf } from './support/fixtures';

const expander = new IcalCalendarExpander();
const ZONE = 'Europe/Bratislava';
const recurring = parseFixture('google-recurring.ics').events;
const window = (from: string, to: string, timeZone = ZONE) => ({ from, to, timeZone });

describe('IcalCalendarExpander', () => {
  it('expands a weekly series across the DST change in local wall time', () => {
    const occurrences = expander.expand(
      seriesOf(recurring, 'standup-series@google.com'),
      window('2026-10-19T00:00:00Z', '2026-11-03T00:00:00Z'),
    );
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      '2026-10-19T08:00:00.000Z',
      '2026-10-21T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
    expect(occurrences[0]).toMatchObject({
      end: '2026-10-19T08:15:00.000Z',
      allDay: false,
      recurrenceId: '2026-10-19T08:00:00.000Z',
    });
  });

  it('applies moved and cancelled overrides', () => {
    const occurrences = expander.expand(
      seriesOf(recurring, 'standup-series@google.com'),
      window('2026-11-04T00:00:00Z', '2026-11-12T00:00:00Z'),
    );
    expect(
      occurrences.map((occurrence) => [
        occurrence.start,
        occurrence.event.summary,
        occurrence.event.status,
      ]),
    ).toEqual([
      ['2026-11-04T10:30:00.000Z', 'Standup (posunutý)', 'confirmed'],
      ['2026-11-09T09:00:00.000Z', 'Standup', 'confirmed'],
      ['2026-11-11T09:00:00.000Z', 'Standup', 'cancelled'],
    ]);
  });

  it('includes an override moved into the window from outside it', () => {
    const occurrences = expander.expand(
      seriesOf(recurring, 'standup-series@google.com'),
      window('2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z'),
    );
    expect(occurrences.map((occurrence) => occurrence.event.summary)).toEqual([
      'Standup (posunutý)',
    ]);
  });

  it('places all-day events at local midnight of the viewer zone', () => {
    const occurrences = expander.expand(
      seriesOf(recurring, 'holiday-17nov@google.com'),
      window('2026-11-16T23:00:00Z', '2026-11-17T23:00:00Z'),
    );
    expect(occurrences).toEqual([
      expect.objectContaining({
        allDay: true,
        start: '2026-11-16T23:00:00.000Z',
        end: '2026-11-17T23:00:00.000Z',
      }),
    ]);
  });

  it('honours COUNT and interprets floating times in the viewer zone', () => {
    const retro = expander.expand(
      seriesOf(recurring, 'retro@google.com'),
      window('2026-11-15T00:00:00Z', '2027-01-01T00:00:00Z', 'UTC'),
    );
    expect(retro.map((occurrence) => occurrence.start)).toEqual([
      '2026-11-20T13:00:00.000Z',
      '2026-11-27T13:00:00.000Z',
      '2026-12-04T13:00:00.000Z',
    ]);
    const floating = expander.expand(
      seriesOf(parseFixture('zone-fallbacks.ics').events, 'floating@example.test'),
      window('2026-11-16T00:00:00Z', '2026-11-17T00:00:00Z', 'America/New_York'),
    );
    expect(floating[0]).toMatchObject({
      start: '2026-11-16T12:30:00.000Z',
      end: '2026-11-16T13:15:00.000Z',
    });
  });

  it('keeps Outlook times correct through the embedded Windows zone', () => {
    const outlook = parseFixture('outlook-request.ics').events;
    const occurrences = expander.expand(
      seriesOf(outlook, outlook[0]?.uid ?? ''),
      window('2026-11-16T00:00:00Z', '2026-11-17T00:00:00Z', 'Asia/Tokyo'),
    );
    expect(occurrences[0]).toMatchObject({
      start: '2026-11-16T15:00:00.000Z',
      end: '2026-11-16T15:30:00.000Z',
    });
  });
});

import type { GoogleCalendarId } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { buildEventBody, type EventDraft } from '../src/features/calendar/google/event-draft';

const DAY = new Date(2026, 10, 20);
const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  calendarId: 'gcl-1' as GoogleCalendarId,
  title: ' Porada ',
  allDay: false,
  from: '9:30',
  to: '10:15',
  location: '',
  attendees: '',
  ...overrides,
});

describe('event draft', () => {
  it('builds a timed event on the selected day in local time', () => {
    const result = buildEventBody(draft(), DAY, 'Europe/Bratislava');

    expect(result).toEqual({
      ok: true,
      body: {
        calendarId: 'gcl-1',
        title: 'Porada',
        allDay: false,
        start: new Date(2026, 10, 20, 9, 30).toISOString(),
        end: new Date(2026, 10, 20, 10, 15).toISOString(),
        timeZone: 'Europe/Bratislava',
        location: null,
        attendees: [],
      },
    });
  });

  it('builds an all-day event that ends at the next midnight', () => {
    const result = buildEventBody(draft({ allDay: true, from: '', to: '' }), DAY, 'UTC');

    expect(result.ok && [result.body.start, result.body.end]).toEqual([
      new Date(2026, 10, 20).toISOString(),
      new Date(2026, 10, 21).toISOString(),
    ]);
  });

  it('reports missing titles, bad times and invalid attendees in Slovak', () => {
    expect(buildEventBody(draft({ title: ' ' }), DAY, 'UTC')).toEqual({
      ok: false,
      error: 'Zadaj názov udalosti.',
    });
    expect(buildEventBody(draft({ to: '25:00' }), DAY, 'UTC')).toMatchObject({ ok: false });
    expect(buildEventBody(draft({ attendees: 'peter@firma.sk, nie-adresa' }), DAY, 'UTC')).toEqual({
      ok: false,
      error: 'Niektorá adresa účastníka nie je platná.',
    });
    expect(buildEventBody(draft({ calendarId: null }), DAY, 'UTC')).toEqual({
      ok: false,
      error: 'Vyber kalendár.',
    });
  });
});

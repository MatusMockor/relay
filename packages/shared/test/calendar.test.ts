import { describe, expect, it } from 'vitest';
import {
  CalendarWindowQuerySchema,
  CreateCalendarSubscriptionBodySchema,
} from '../src/api/endpoints/calendar';
import { TimeZoneSchema } from '../src/domain/time-zone';

describe('calendar contract', () => {
  it('accepts a day window in a known zone', () => {
    const parsed = CalendarWindowQuerySchema.safeParse({
      from: '2026-11-15T00:00:00+01:00',
      to: '2026-11-16T00:00:00+01:00',
      timeZone: 'Europe/Bratislava',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects reversed, oversized windows and unknown zones', () => {
    const base = { from: '2026-11-15T00:00:00Z', timeZone: 'Europe/Bratislava' };
    expect(
      CalendarWindowQuerySchema.safeParse({ ...base, to: '2026-11-14T00:00:00Z' }).success,
    ).toBe(false);
    expect(
      CalendarWindowQuerySchema.safeParse({ ...base, to: '2027-03-01T00:00:00Z' }).success,
    ).toBe(false);
    expect(TimeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });

  it('accepts only https feed URLs', () => {
    const body = { name: 'Práca', color: '#4f8cff' };
    expect(
      CreateCalendarSubscriptionBodySchema.safeParse({
        ...body,
        url: 'https://calendar.google.com/calendar/ical/x/basic.ics',
      }).success,
    ).toBe(true);
    expect(
      CreateCalendarSubscriptionBodySchema.safeParse({ ...body, url: 'http://example.com/a.ics' })
        .success,
    ).toBe(false);
    expect(
      CreateCalendarSubscriptionBodySchema.safeParse({ ...body, url: 'webcal://example.com/a.ics' })
        .success,
    ).toBe(false);
  });
});

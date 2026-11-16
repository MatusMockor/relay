import { describe, expect, it } from 'vitest';
import { IcalCalendarParser } from '../src';
import { firstEvent, parseFixture } from './support/fixtures';

describe('IcalCalendarParser', () => {
  it('parses a Google invitation with its VTIMEZONE, people and status', () => {
    const calendar = parseFixture('google-request.ics');
    expect(calendar.method).toBe('REQUEST');
    expect(firstEvent(calendar)).toMatchObject({
      uid: '7kukuqrfedlm2f9t2vr42q2m4s@google.com',
      recurrenceId: null,
      sequence: 0,
      dtstamp: '2026-11-15T08:00:00.000Z',
      status: 'confirmed',
      summary: 'Plánovanie Q1',
      location: 'Zasadačka Dunaj',
      organizer: { name: 'Peter Král', email: 'peter@partner.test' },
      allDay: false,
      startsAt: '2026-11-16T09:00:00.000Z',
      endsAt: '2026-11-16T10:00:00.000Z',
      recurring: false,
    });
    expect(firstEvent(calendar).attendees).toEqual([
      {
        name: 'Peter Král',
        email: 'peter@partner.test',
        partstat: 'accepted',
        role: 'REQ-PARTICIPANT',
      },
      {
        name: 'alice@example.com',
        email: 'alice@example.com',
        partstat: 'needs-action',
        role: 'REQ-PARTICIPANT',
      },
    ]);
    expect(firstEvent(calendar).description).toContain('Google Meet');
  });

  it('resolves Outlook Windows time zone names through the embedded VTIMEZONE', () => {
    const event = firstEvent(parseFixture('outlook-request.ics'));
    expect(event).toMatchObject({
      summary: '1:1 s Luciou',
      startsAt: '2026-11-16T15:00:00.000Z',
      endsAt: '2026-11-16T15:30:00.000Z',
      organizer: { name: 'Lucia Horváthová', email: 'lucia@corp.test' },
    });
    expect(event.uid).toMatch(/^040000008200E00074C5B7101A82E008/);
    expect(event.attendees[0]?.email).toBe('alice@example.com');
    expect(event.ics).toContain('BEGIN:VTIMEZONE');
    expect(event.ics).toContain('TZID:Central Europe Standard Time');
  });

  it('marks Outlook cancellations as cancelled with the higher sequence', () => {
    const calendar = parseFixture('outlook-cancel.ics');
    expect(calendar.method).toBe('CANCEL');
    expect(firstEvent(calendar)).toMatchObject({ status: 'cancelled', sequence: 1 });
  });

  it('keeps Apple all-day events as dates', () => {
    const event = firstEvent(parseFixture('apple-allday.ics'));
    expect(event).toMatchObject({
      allDay: true,
      startsAt: '2026-11-18T00:00:00.000Z',
      endsAt: '2026-11-20T00:00:00.000Z',
      organizer: { name: 'Martin Šimko', email: 'martin@icloud.test' },
    });
  });

  it('parses recurring masters, overrides and finite ranges', () => {
    const { events } = parseFixture('google-recurring.ics');
    const standup = events.filter((event) => event.uid === 'standup-series@google.com');
    expect(standup).toHaveLength(3);
    expect(standup[0]).toMatchObject({ recurring: true, rangeEndsAt: null });
    expect(standup.map((event) => event.recurrenceId)).toEqual([
      null,
      '2026-11-04T09:00:00.000Z',
      '2026-11-11T09:00:00.000Z',
    ]);
    expect(standup[2]?.status).toBe('cancelled');
    const retro = events.find((event) => event.uid === 'retro@google.com');
    expect(retro).toMatchObject({ recurring: true });
    expect(Date.parse(retro?.rangeEndsAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse('2026-12-04T14:30:00.000Z'),
    );
  });

  it('falls back to IANA zones, floating times and default durations', () => {
    const { events } = parseFixture('zone-fallbacks.ics');
    expect(events.map((event) => event.uid)).toEqual([
      'iana-no-vtimezone@example.test',
      'floating@example.test',
      'no-end-date@example.test',
    ]);
    expect(events[0]).toMatchObject({ startsAt: '2026-07-15T07:00:00.000Z' });
    expect(events[1]).toMatchObject({
      startsAt: '2026-11-16T07:30:00.000Z',
      endsAt: '2026-11-16T08:15:00.000Z',
    });
    expect(events[2]).toMatchObject({
      allDay: true,
      startsAt: '2026-11-21T00:00:00.000Z',
      endsAt: '2026-11-22T00:00:00.000Z',
    });
  });

  it('returns null for garbage and oversized input', () => {
    const parser = new IcalCalendarParser();
    expect(parser.parse('not a calendar')).toBeNull();
    expect(parser.parse('BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD\r\n')).toBeNull();
    expect(parser.parse(`BEGIN:VCALENDAR\r\n${'X'.repeat(11 * 1024 * 1024)}`)).toBeNull();
  });
});

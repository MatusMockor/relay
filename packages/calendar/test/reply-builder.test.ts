import { describe, expect, it } from 'vitest';
import { IcalCalendarParser, IcalReplyBuilder } from '../src';
import { firstEvent, parseFixture, stored } from './support/fixtures';

const builder = new IcalReplyBuilder();
const parser = new IcalCalendarParser();
const ALICE = { name: 'Alice Novák', email: 'alice@example.com' };

describe('IcalReplyBuilder', () => {
  it('builds an RFC 5546 REPLY with only my attendee and the original identifiers', () => {
    const event = stored({ ...firstEvent(parseFixture('google-request.ics')), sequence: 0 });
    const ics = builder.build({
      event,
      attendee: ALICE,
      response: 'accepted',
      dtstamp: '2026-11-15T10:00:00.000Z',
    });

    expect(ics).toContain('METHOD:REPLY');
    expect(ics).toContain('PRODID:-//Relay//Calendar 1.0//SK');
    expect(ics).toContain('UID:7kukuqrfedlm2f9t2vr42q2m4s@google.com');
    expect(ics).toContain('DTSTAMP:20261115T100000Z');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).not.toContain('VALARM');
    expect(ics).not.toContain('peter@partner.test;');
    const reply = parser.parse(ics);
    expect(reply?.method).toBe('REPLY');
    expect(reply?.events[0]).toMatchObject({
      organizer: { name: 'Peter Král', email: 'peter@partner.test' },
      startsAt: '2026-11-16T09:00:00.000Z',
      attendees: [
        {
          name: 'Alice Novák',
          email: 'alice@example.com',
          partstat: 'accepted',
          role: 'REQ-PARTICIPANT',
        },
      ],
    });
    expect(ics).not.toMatch(/RSVP=TRUE/);
  });

  it('answers a single occurrence with its RECURRENCE-ID', () => {
    const override = parseFixture('google-recurring.ics').events[1];
    expect(override?.recurrenceId).not.toBeNull();
    const ics = builder.build({
      event: stored(override ?? firstEvent(parseFixture('google-request.ics'))),
      attendee: { name: null, email: 'alice@example.com' },
      response: 'declined',
      dtstamp: '2026-11-15T10:00:00.000Z',
    });
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Bratislava:20261104T100000');
    expect(ics).toContain('PARTSTAT=DECLINED');
    expect(ics).toContain('SEQUENCE:1');
  });
});

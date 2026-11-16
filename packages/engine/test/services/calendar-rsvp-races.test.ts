import { describe, expect, it } from 'vitest';
import type { ParsedCalendar } from '../../src';
import { calendarOf, eventData, ORGANIZER } from '../support/calendar-fixtures';
import { deliverMail, ME, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const JANA = { name: 'Jana Mala', email: 'jana@partner.test' };

const INVITE = eventData({
  attendees: [
    { ...ORGANIZER, partstat: 'accepted', role: 'CHAIR' },
    { name: ME.name, email: ME.email, partstat: 'needs-action', role: 'REQ-PARTICIPANT' },
    { ...JANA, partstat: 'needs-action', role: 'REQ-PARTICIPANT' },
  ],
});

const deliver = (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
) => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
};

const seedInvite = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  deliver(engine, seeded, 'inv', calendarOf('REQUEST', INVITE));
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const event = present([...engine.db.tables.calendarEvents.values()][0]);
  return { seeded, eventId: event.id };
};

const arriveDuringSmtp = (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
) => {
  engine.sender.beforeSend = async () => {
    engine.sender.beforeSend = null;
    deliver(engine, seeded, id, calendar);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  };
};

const statusOf = (engine: TestEngine, email: string) =>
  present([...engine.db.tables.calendarEvents.values()][0]).attendees.find(
    (attendee) => attendee.email === email,
  )?.partstat;

describe('Calendar RSVP against concurrent invitation updates', () => {
  it('keeps a REPLY of another attendee stored while the RSVP was being sent', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    const janaReply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    arriveDuringSmtp(engine, seeded, 'jana', calendarOf('REPLY', janaReply));

    const invitation = await engine.services.calendar.respond(USER_ID, eventId, 'accepted', ZONE);

    expect(engine.sender.sent).toHaveLength(1);
    expect(invitation.myStatus).toBe('accepted');
    expect(statusOf(engine, JANA.email)).toBe('accepted');
    expect(statusOf(engine, ME.email)).toBe('accepted');
  });

  it('does not apply an answer to an invitation that was rescheduled while it was sent', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    const moved = eventData({
      ...INVITE,
      sequence: 1,
      dtstamp: '2026-11-15T09:30:00.000Z',
      startsAt: '2026-11-16T13:00:00.000Z',
      endsAt: '2026-11-16T14:00:00.000Z',
      rangeEndsAt: '2026-11-16T14:00:00.000Z',
    });
    arriveDuringSmtp(engine, seeded, 'moved', calendarOf('REQUEST', moved));

    const invitation = await engine.services.calendar.respond(USER_ID, eventId, 'declined', ZONE);

    expect(engine.sender.sent).toHaveLength(1);
    const stored = present(engine.db.tables.calendarEvents.get(eventId));
    expect(stored).toMatchObject({
      sequence: 1,
      startsAt: '2026-11-16T13:00:00.000Z',
      myPartstat: 'needs-action',
    });
    expect(statusOf(engine, ME.email)).toBe('needs-action');
    expect(invitation.myStatus).toBe('needs-action');
  });

  it('reports a conflict instead of dropping the answer when the invitation keeps changing', async () => {
    const engine = createTestEngine();
    const { eventId } = await seedInvite(engine);
    const events = engine.repositories.calendarEvents;
    expect(events).toBeInstanceOf(MemoryCalendarEventRepository);
    const changes = { count: 0 };
    (events as MemoryCalendarEventRepository).beforeUpdateResponse = (id) => {
      const stored = present(engine.db.tables.calendarEvents.get(id));
      changes.count += 1;
      engine.db.tables.calendarEvents.set(id, {
        ...stored,
        revision: stored.revision + 1,
      });
      return Promise.resolve();
    };

    await expect(
      engine.services.calendar.respond(USER_ID, eventId, 'accepted', ZONE),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(engine.sender.sent).toHaveLength(1);
    expect(changes.count).toBe(5);
    expect(statusOf(engine, ME.email)).toBe('needs-action');
  });
});

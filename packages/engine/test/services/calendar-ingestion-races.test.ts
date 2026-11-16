import type { CalendarEventId } from '@relay/shared/domain';
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

const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

const memoryEvents = (engine: TestEngine): MemoryCalendarEventRepository => {
  expect(engine.repositories.calendarEvents).toBeInstanceOf(MemoryCalendarEventRepository);
  return engine.repositories.calendarEvents as MemoryCalendarEventRepository;
};

const seedInvite = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  deliver(engine, seeded, 'inv', calendarOf('REQUEST', INVITE));
  await sync(engine, seeded);
  const event = present([...engine.db.tables.calendarEvents.values()][0]);
  return { seeded, eventId: event.id };
};

const answerBeforeIngestionWrites = (engine: TestEngine, eventId: CalendarEventId) => {
  const events = memoryEvents(engine);
  events.beforeWrite = async () => {
    events.beforeWrite = null;
    await engine.services.calendar.respond(USER_ID, eventId, 'accepted', ZONE);
  };
};

const stored = (engine: TestEngine, eventId: CalendarEventId) =>
  present(engine.db.tables.calendarEvents.get(eventId));

const statusOf = (engine: TestEngine, eventId: CalendarEventId, email: string) =>
  stored(engine, eventId).attendees.find((attendee) => attendee.email === email)?.partstat;

describe('Calendar invitation ingestion against a concurrent RSVP', () => {
  it('keeps my answer when another attendee REPLY is applied from an older read', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    answerBeforeIngestionWrites(engine, eventId);
    const janaReply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    deliver(engine, seeded, 'jana', calendarOf('REPLY', janaReply));

    await sync(engine, seeded);

    expect(engine.sender.sent).toHaveLength(1);
    expect(stored(engine, eventId).myPartstat).toBe('accepted');
    expect(statusOf(engine, eventId, ME.email)).toBe('accepted');
    expect(statusOf(engine, eventId, JANA.email)).toBe('accepted');
  });

  it('keeps my answer when a same-SEQUENCE REQUEST update is applied from an older read', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    answerBeforeIngestionWrites(engine, eventId);
    const updated = eventData({
      ...INVITE,
      dtstamp: '2026-11-15T09:30:00.000Z',
      description: 'Pridaná agenda',
    });
    deliver(engine, seeded, 'update', calendarOf('REQUEST', updated));

    await sync(engine, seeded);

    expect(stored(engine, eventId)).toMatchObject({
      description: 'Pridaná agenda',
      myPartstat: 'accepted',
    });
    const answeredAt = engine.clock.now().toISOString();
    expect(
      stored(engine, eventId).attendees.find((attendee) => attendee.email === ME.email),
    ).toMatchObject({ partstat: 'accepted', repliedAt: answeredAt });

    const olderReply = eventData({
      dtstamp: '2026-11-15T09:45:00.000Z',
      attendees: [{ name: ME.name, email: ME.email, partstat: 'tentative', role: null }],
    });
    deliver(engine, seeded, 'older-reply', calendarOf('REPLY', olderReply));
    await sync(engine, seeded);

    expect(stored(engine, eventId).myPartstat).toBe('accepted');
    expect(statusOf(engine, eventId, ME.email)).toBe('accepted');
  });

  it('keeps answers stored before a same-SEQUENCE REQUEST that still lists them as unanswered', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    const janaReply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    deliver(engine, seeded, 'jana', calendarOf('REPLY', janaReply));
    await sync(engine, seeded);
    const resent = eventData({ ...INVITE, dtstamp: '2026-11-15T09:40:00.000Z' });
    deliver(engine, seeded, 'resent', calendarOf('REQUEST', resent));
    await sync(engine, seeded);

    expect(stored(engine, eventId).attendees.find((a) => a.email === JANA.email)).toMatchObject({
      partstat: 'accepted',
      repliedAt: '2026-11-15T09:30:00.000Z',
    });
  });

  it('takes a newer organizer view of an attendee answer and resets answers on a new SEQUENCE', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    const janaReply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    deliver(engine, seeded, 'jana', calendarOf('REPLY', janaReply));
    await sync(engine, seeded);
    const organizerView = eventData({
      ...INVITE,
      dtstamp: '2026-11-15T09:40:00.000Z',
      attendees: INVITE.attendees.map((attendee) =>
        attendee.email === JANA.email ? { ...attendee, partstat: 'declined' } : attendee,
      ),
    });
    deliver(engine, seeded, 'view', calendarOf('REQUEST', organizerView));
    await sync(engine, seeded);
    expect(statusOf(engine, eventId, JANA.email)).toBe('declined');

    const moved = eventData({ ...INVITE, sequence: 1, dtstamp: '2026-11-15T09:50:00.000Z' });
    deliver(engine, seeded, 'moved', calendarOf('REQUEST', moved));
    await sync(engine, seeded);
    expect(statusOf(engine, eventId, JANA.email)).toBe('needs-action');
  });

  it('keeps my answer on an invitation cancelled from an older read', async () => {
    const engine = createTestEngine();
    const { seeded, eventId } = await seedInvite(engine);
    answerBeforeIngestionWrites(engine, eventId);
    const cancel = eventData({ ...INVITE, sequence: 1, dtstamp: '2026-11-15T09:30:00.000Z' });
    deliver(engine, seeded, 'cancel', calendarOf('CANCEL', cancel));

    await sync(engine, seeded);

    expect(stored(engine, eventId)).toMatchObject({ status: 'cancelled', myPartstat: 'accepted' });
    expect(statusOf(engine, eventId, ME.email)).toBe('accepted');
  });
});

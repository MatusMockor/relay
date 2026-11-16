import { describe, expect, it } from 'vitest';
import type { ParsedCalendar } from '../../src';
import { calendarOf, eventData, ORGANIZER } from '../support/calendar-fixtures';
import { deliverMail, ME, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ORGANIZED = eventData({
  organizer: { name: ME.name, email: ME.email },
  attendees: [
    { name: ME.name, email: ME.email, partstat: 'accepted', role: 'CHAIR' },
    { ...ORGANIZER, partstat: 'needs-action', role: 'REQ-PARTICIPANT' },
  ],
});

const replyFrom = (sequence: number, dtstamp: string) =>
  calendarOf(
    'REPLY',
    eventData({
      sequence,
      dtstamp,
      attendees: [{ ...ORGANIZER, partstat: 'accepted', role: null }],
    }),
  );

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

const parkedReplies = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'calendar-reply');

const peterStatus = (engine: TestEngine) =>
  present([...engine.db.tables.calendarEvents.values()][0]).attendees.find(
    (attendee) => attendee.email === ORGANIZER.email,
  )?.partstat;

describe('Calendar REPLY ordering', () => {
  it('keeps a REPLY that arrives before its REQUEST and applies it later', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'reply', replyFrom(0, '2026-11-15T08:00:00.000Z'));

    await sync(engine, seeded);

    expect(engine.db.tables.calendarEvents.size).toBe(0);
    expect(parkedReplies(engine)).toHaveLength(1);
    deliver(engine, seeded, 'request', calendarOf('REQUEST', ORGANIZED));
    await sync(engine, seeded);

    expect(peterStatus(engine)).toBe('accepted');
    expect(parkedReplies(engine)).toEqual([]);
  });

  it('applies an early REPLY delivered in the same sync as its REQUEST', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'reply', replyFrom(0, '2026-11-15T08:00:00.000Z'));
    deliver(engine, seeded, 'request', calendarOf('REQUEST', ORGANIZED));

    await sync(engine, seeded);

    expect(peterStatus(engine)).toBe('accepted');
    expect(parkedReplies(engine)).toEqual([]);
  });

  it('drops a parked REPLY that is older than the REQUEST it waited for', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'reply', replyFrom(0, '2026-11-15T08:00:00.000Z'));
    await sync(engine, seeded);
    deliver(engine, seeded, 'request', calendarOf('REQUEST', { ...ORGANIZED, sequence: 1 }));

    await sync(engine, seeded);

    expect(peterStatus(engine)).toBe('needs-action');
    expect(parkedReplies(engine)).toEqual([]);
  });

  it('keeps only the newest early REPLY of an attendee', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'newer', replyFrom(0, '2026-11-15T09:00:00.000Z'));
    deliver(
      engine,
      seeded,
      'older',
      calendarOf(
        'REPLY',
        eventData({
          dtstamp: '2026-11-15T08:00:00.000Z',
          attendees: [{ ...ORGANIZER, partstat: 'declined', role: null }],
        }),
      ),
    );

    await sync(engine, seeded);

    expect(parkedReplies(engine)).toHaveLength(1);
    expect(parkedReplies(engine)[0]?.payload).toMatchObject({
      attendee: { partstat: 'accepted' },
    });
  });

  it('ignores an older REPLY of an attendee after a newer one', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'request', calendarOf('REQUEST', ORGANIZED));
    await sync(engine, seeded);
    deliver(engine, seeded, 'accepted', replyFrom(0, '2026-11-15T09:00:00.000Z'));
    deliver(
      engine,
      seeded,
      'declined',
      calendarOf(
        'REPLY',
        eventData({
          dtstamp: '2026-11-15T08:00:00.000Z',
          attendees: [{ ...ORGANIZER, partstat: 'declined', role: null }],
        }),
      ),
    );

    await sync(engine, seeded);

    expect(peterStatus(engine)).toBe('accepted');
  });

  it('keeps attendee responses when the same REQUEST is applied again', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'request', calendarOf('REQUEST', ORGANIZED));
    deliver(engine, seeded, 'reply', replyFrom(0, '2026-11-15T09:00:00.000Z'));
    await sync(engine, seeded);
    deliver(engine, seeded, 'request-copy', calendarOf('REQUEST', ORGANIZED));

    await sync(engine, seeded);

    expect(peterStatus(engine)).toBe('accepted');
    expect(engine.db.tables.calendarEvents.size).toBe(1);
  });

  it('keeps my RSVP when an older REPLY of mine is replayed', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'request', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);
    const event = present([...engine.db.tables.calendarEvents.values()][0]);
    await engine.services.calendar.respond(USER_ID, event.id, 'accepted', 'Europe/Bratislava');
    deliver(
      engine,
      seeded,
      'old-reply',
      calendarOf(
        'REPLY',
        eventData({
          dtstamp: '2026-11-15T08:00:00.000Z',
          attendees: [{ name: ME.name, email: ME.email, partstat: 'declined', role: null }],
        }),
      ),
    );

    await sync(engine, seeded);

    expect(engine.db.tables.calendarEvents.get(event.id)?.myPartstat).toBe('accepted');
  });
});

import { describe, expect, it } from 'vitest';
import type { CalendarInviteWork, ParsedCalendar } from '../../src';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { deliverMail, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const MINUTE = 60_000;
const JANA = { name: 'Jana Mala', email: 'jana@partner.test' };

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

const inviteWork = (engine: TestEngine): CalendarInviteWork[] =>
  [...engine.db.tables.pendingWork.values()]
    .filter((work) => work.kind === 'calendar-invite')
    .map((work) => work.payload as CalendarInviteWork);

const keepChanging = (engine: TestEngine, uid: string) => {
  const events = engine.repositories.calendarEvents;
  expect(events).toBeInstanceOf(MemoryCalendarEventRepository);
  const memory = events as MemoryCalendarEventRepository;
  const writes = { count: 0 };
  memory.beforeWrite = (event) => {
    const row = [...engine.db.tables.calendarEvents.values()].find((entry) => entry.uid === uid);
    if (event.uid !== uid || row === undefined) {
      return Promise.resolve();
    }
    writes.count += 1;
    engine.db.tables.calendarEvents.set(row.id, { ...row, revision: row.revision + 1 });
    return Promise.resolve();
  };
  return { writes, stop: () => (memory.beforeWrite = null) };
};

const janaStatus = (engine: TestEngine) =>
  [...engine.db.tables.calendarEvents.values()]
    .find((event) => event.uid === 'evt-1@partner.test')
    ?.attendees.find((attendee) => attendee.email === JANA.email)?.partstat;

describe('Calendar invitation ingestion that keeps losing the conditional write', () => {
  it('retries the invitation later without marking it failed or blocking others', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'inv', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);
    const changing = keepChanging(engine, 'evt-1@partner.test');
    const reply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    deliver(engine, seeded, 'jana', calendarOf('REPLY', reply));
    deliver(
      engine,
      seeded,
      'other',
      calendarOf('REQUEST', eventData({ uid: 'other@partner.test' })),
    );

    await sync(engine, seeded);

    expect(changing.writes.count).toBe(5);
    expect(
      [...engine.db.tables.calendarEvents.values()].some(
        (event) => event.uid === 'other@partner.test',
      ),
    ).toBe(true);
    const [pending] = inviteWork(engine);
    expect(inviteWork(engine)).toHaveLength(1);
    expect(present(pending)).toMatchObject({
      attempts: 0,
      failedAt: null,
      nextAttemptAt: new Date(engine.clock.now().getTime() + MINUTE).toISOString(),
    });
    expect(present(pending).lastError).toContain('changed');
    expect(janaStatus(engine)).toBeUndefined();
  });

  it('never turns repeated conflicts into a poison invitation', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliver(engine, seeded, 'inv', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);
    const changing = keepChanging(engine, 'evt-1@partner.test');
    const reply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...JANA, partstat: 'accepted', role: null }],
    });
    deliver(engine, seeded, 'jana', calendarOf('REPLY', reply));

    for (let round = 0; round < 8; round += 1) {
      await sync(engine, seeded);
      engine.clock.advance(MINUTE);
    }

    expect(inviteWork(engine)).toMatchObject([{ attempts: 0, failedAt: null }]);
    changing.stop();
    await sync(engine, seeded);

    expect(inviteWork(engine)).toEqual([]);
    expect(janaStatus(engine)).toBe('accepted');
  });
});

import { describe, expect, it } from 'vitest';
import type { CalendarInviteWork, ParsedCalendar } from '../../src';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { MemoryThreadRepository } from '../support/memory/memory-thread-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const MINUTE = 60_000;

const deliverInvite = (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
): void => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
};

const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

const memoryEvents = (engine: TestEngine): MemoryCalendarEventRepository => {
  expect(engine.repositories.calendarEvents).toBeInstanceOf(MemoryCalendarEventRepository);
  return engine.repositories.calendarEvents as MemoryCalendarEventRepository;
};

const memoryThreads = (engine: TestEngine): MemoryThreadRepository => {
  expect(engine.repositories.threads).toBeInstanceOf(MemoryThreadRepository);
  return engine.repositories.threads as MemoryThreadRepository;
};

const inviteWork = (engine: TestEngine): CalendarInviteWork[] =>
  [...engine.db.tables.pendingWork.values()]
    .filter((work) => work.kind === 'calendar-invite')
    .map((work) => work.payload as CalendarInviteWork);

describe('Durable calendar invitation queue', () => {
  it('keeps the invitation queued with the message and retries it with backoff', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await sync(engine, seeded);
    const events = memoryEvents(engine);
    events.failUpsertUid = 'evt-1@partner.test';
    deliverInvite(engine, seeded, 'inv', calendarOf('REQUEST', eventData()));

    await sync(engine, seeded);

    expect(engine.db.tables.messages.size).toBe(1);
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
    expect(inviteWork(engine)).toMatchObject([
      { attempts: 1, nextAttemptAt: '2026-11-15T10:01:00.000Z', failedAt: null },
    ]);
    await sync(engine, seeded);
    expect(inviteWork(engine)).toMatchObject([{ attempts: 1 }]);

    events.failUpsertUid = null;
    engine.clock.advance(MINUTE);
    await sync(engine, seeded);

    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toHaveLength(1);
    expect(inviteWork(engine)).toEqual([]);
    expect(engine.events.ofType('calendar.updated')).toHaveLength(1);
  });

  it('marks a poison invitation failed without blocking other invitations', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const events = memoryEvents(engine);
    events.failUpsertUid = 'poison@partner.test';
    deliverInvite(
      engine,
      seeded,
      'bad',
      calendarOf('REQUEST', eventData({ uid: 'poison@partner.test' })),
    );
    deliverInvite(engine, seeded, 'good', calendarOf('REQUEST', eventData()));

    await sync(engine, seeded);
    for (const minutes of [1, 5, 30, 120, 720]) {
      engine.clock.advance(minutes * MINUTE);
      await sync(engine, seeded);
    }

    const [occurrence] = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrence?.title).toBe('Plánovanie Q1');
    expect(inviteWork(engine)).toMatchObject([
      {
        attempts: 6,
        failedAt: '2026-11-16T00:36:00.000Z',
        lastError: 'Storing poison@partner.test failed',
      },
    ]);
    engine.clock.advance(24 * 60 * MINUTE);
    await sync(engine, seeded);
    expect(inviteWork(engine)).toMatchObject([{ attempts: 6 }]);
    expect(engine.db.tables.messages.size).toBe(2);
  });

  it('applies a queued invitation after a sync that crashed before processing it', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const threads = memoryThreads(engine);
    threads.failUpsert = 'disk full';
    deliverInvite(engine, seeded, 'inv', calendarOf('REQUEST', eventData()));

    const failed = await sync(engine, seeded);

    expect(failed.ok).toBe(false);
    expect(engine.db.tables.messages.size).toBe(1);
    expect(inviteWork(engine)).toHaveLength(1);
    threads.failUpsert = null;
    await sync(engine, seeded);
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toHaveLength(1);
    expect(inviteWork(engine)).toEqual([]);
  });
});

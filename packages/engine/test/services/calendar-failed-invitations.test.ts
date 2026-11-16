import type { AccountId, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { CalendarInviteWork } from '../../src';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const MINUTE = 60_000;
const POISON = 'poison@partner.test';

const memoryEvents = (engine: TestEngine): MemoryCalendarEventRepository => {
  expect(engine.repositories.calendarEvents).toBeInstanceOf(MemoryCalendarEventRepository);
  return engine.repositories.calendarEvents as MemoryCalendarEventRepository;
};

const inviteWork = (engine: TestEngine): CalendarInviteWork[] =>
  [...engine.db.tables.pendingWork.values()]
    .filter((work) => work.kind === 'calendar-invite')
    .map((work) => work.payload as CalendarInviteWork);

const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

const failInvitation = async (engine: TestEngine, seeded: SeededAccount, id: string) => {
  await sync(engine, seeded);
  memoryEvents(engine).failUpsertUid = POISON;
  engine.calendar.parser.register(id, calendarOf('REQUEST', eventData({ uid: POISON })));
  deliverMail(seeded.server, 'INBOX', {
    id,
    subject: 'Pozvánka: Plánovanie Q1',
    headers: { 'X-Test-Calendar': id },
  });
  await sync(engine, seeded);
  for (const minutes of [1, 5, 30, 120, 720]) {
    engine.clock.advance(minutes * MINUTE);
    await sync(engine, seeded);
  }
  const [failed] = await engine.services.failedInvitations.list(USER_ID);
  expect(failed).toBeDefined();
  return { accountId: seeded.account.id, messageId: failed?.messageId ?? ('' as MessageId) };
};

describe('Failed calendar invitations', () => {
  it('lists an invitation that failed six times with its message', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');

    expect(await engine.services.failedInvitations.list(USER_ID)).toEqual([
      {
        accountId: seeded.account.id,
        accountEmail: seeded.account.email,
        messageId: ref.messageId,
        threadId: expect.any(String) as string,
        subject: 'Pozvánka: Plánovanie Q1',
        from: { name: 'Peter Kral', email: 'peter@partner.test' },
        date: '2026-11-15T08:00:00.000Z',
        attempts: 6,
        failedAt: '2026-11-16T00:36:00.000Z',
        lastError: `Storing ${POISON} failed`,
      },
    ]);
    expect(await engine.services.failedInvitations.list(OTHER_USER_ID)).toEqual([]);
  });

  it('keeps listing a failed invitation whose message is gone', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');
    engine.db.tables.messages.delete(ref.messageId);

    expect(await engine.services.failedInvitations.list(USER_ID)).toMatchObject([
      { messageId: ref.messageId, subject: null, from: null, date: null, attempts: 6 },
    ]);
  });

  it('applies a retried invitation right away once the cause is gone', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');
    memoryEvents(engine).failUpsertUid = null;
    const published = engine.events.ofType('calendar.updated').length;

    expect(await engine.services.failedInvitations.retry(USER_ID, ref)).toEqual({ applied: true });

    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toHaveLength(1);
    expect(inviteWork(engine)).toEqual([]);
    expect(await engine.services.failedInvitations.list(USER_ID)).toEqual([]);
    expect(engine.events.ofType('calendar.updated')).toHaveLength(published + 1);
  });

  it('starts the retry schedule again when the retried invitation still fails', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');

    expect(await engine.services.failedInvitations.retry(USER_ID, ref)).toEqual({
      applied: false,
    });

    expect(inviteWork(engine)).toMatchObject([
      { attempts: 1, nextAttemptAt: '2026-11-16T00:37:00.000Z', failedAt: null },
    ]);
    expect(await engine.services.failedInvitations.list(USER_ID)).toEqual([]);
  });

  it('dismisses a failed invitation without touching other queued invitations', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');
    engine.calendar.parser.register('later', calendarOf('REQUEST', eventData({ uid: POISON })));
    deliverMail(seeded.server, 'INBOX', { id: 'later', headers: { 'X-Test-Calendar': 'later' } });
    await sync(engine, seeded);

    await engine.services.failedInvitations.dismiss(USER_ID, ref);

    expect(inviteWork(engine)).toMatchObject([{ attempts: 1, failedAt: null }]);
    expect(await engine.services.failedInvitations.list(USER_ID)).toEqual([]);
  });

  it('refuses invitations of other users, unknown accounts and rows that are not failed', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const ref = await failInvitation(engine, seeded, 'bad');
    const failed = engine.services.failedInvitations;

    await expect(failed.retry(OTHER_USER_ID, ref)).rejects.toMatchObject({ code: 'not_found' });
    await expect(failed.dismiss(OTHER_USER_ID, ref)).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      failed.retry(USER_ID, { ...ref, accountId: 'account_missing' as AccountId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(inviteWork(engine)).toMatchObject([{ attempts: 6 }]);

    await failed.retry(USER_ID, ref);
    await expect(failed.retry(USER_ID, ref)).rejects.toMatchObject({ code: 'not_found' });
    await expect(failed.dismiss(USER_ID, ref)).rejects.toMatchObject({ code: 'not_found' });
    expect(inviteWork(engine)).toMatchObject([{ attempts: 1, failedAt: null }]);
  });
});

import { describe, expect, it } from 'vitest';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { ME, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { cancelOne, instance, master, occurrenceRow, rows, SERIES } from '../support/range-invites';
import { corrupt, deliverAt, rebuildWork, seedRebuild, sync } from '../support/rebuild-invites';
import { createTestEngine, type TestEngine } from '../support/test-engine';

const LATER = '2026-11-30T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
const day = (date: number): string => `2026-11-0${String(date)}T08:00:00.000Z`;

const masterRow = (engine: TestEngine) => rows(engine).find((row) => row.recurrenceId === null);

const memoryEvents = (engine: TestEngine): MemoryCalendarEventRepository => {
  expect(engine.repositories.calendarEvents).toBeInstanceOf(MemoryCalendarEventRepository);
  return engine.repositories.calendarEvents as MemoryCalendarEventRepository;
};

const seedInbox = async (engine: TestEngine, seeded: SeededAccount) => {
  const inbox = present(
    [...engine.db.tables.mailboxes.values()].find((mailbox) => mailbox.role === 'inbox'),
  );
  await engine.repositories.pendingWork.put({
    accountId: seeded.account.id,
    kind: 'calendar-rebuild',
    ref: inbox.id,
    payload: { mailboxId: inbox.id, afterUid: 0 },
    createdAt: day(9),
  });
};

describe('rebuild of invitation series in unusual conditions', () => {
  it('keeps a series cancelled by a mail whose Date is older than its invitation', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(3));
    deliverAt(
      engine,
      seeded,
      'all',
      cancelOne(LATER, { recurrenceId: null, sequence: 1, dtstamp: at(11) }),
      day(2),
    );
    await sync(engine, seeded);
    expect(masterRow(engine)?.status).toBe('cancelled');

    await seedRebuild(engine, seeded);
    await sync(engine, seeded);

    expect(masterRow(engine)).toMatchObject({ status: 'cancelled', sequence: 1 });
  });

  it('reads mailboxes that appear while the rebuild runs', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    deliverAt(
      engine,
      seeded,
      'moved',
      master({ sequence: 2, dtstamp: at(12), summary: 'Porada v novej sále' }),
      day(2),
      'Archive',
    );
    await sync(engine, seeded);
    await seedInbox(engine, seeded);

    await sync(engine, seeded);

    expect(masterRow(engine)).toMatchObject({ sequence: 2, summary: 'Porada v novej sále' });
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('keeps my later local answer over an earlier mailed one', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    const mine = { name: ME.name, email: ME.email, role: null };
    deliverAt(
      engine,
      seeded,
      'my-reply',
      calendarOf('REPLY', eventData({ ...SERIES, attendees: [{ ...mine, partstat: 'accepted' }] })),
      day(2),
      'Sent',
    );
    await sync(engine, seeded);
    const row = present(masterRow(engine));
    corrupt(engine, row, {
      myPartstat: 'declined',
      attendees: row.attendees.map((attendee) =>
        attendee.email === ME.email
          ? { ...attendee, partstat: 'declined', repliedAt: '2026-11-16T09:00:00.000Z' }
          : attendee,
      ),
    });

    await seedRebuild(engine, seeded);
    await sync(engine, seeded);

    const rebuilt = present(masterRow(engine));
    expect(rebuilt.myPartstat).toBe('declined');
    expect(rebuilt.attendees.find((attendee) => attendee.email === ME.email)?.partstat).toBe(
      'declined',
    );
  });

  it('retries a series that failed and gives up after three replays', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    deliverAt(engine, seeded, 'later', instance('11-30', { sequence: 1, dtstamp: at(11) }), day(2));
    await sync(engine, seeded);
    corrupt(engine, occurrenceRow(engine, LATER), { status: 'cancelled', sequence: 2 });
    await seedRebuild(engine, seeded);
    const events = memoryEvents(engine);
    events.failUpsertUid = SERIES.uid;

    await sync(engine, seeded);
    expect(rebuildWork(engine).length).toBeGreaterThan(0);
    events.failUpsertUid = null;
    await sync(engine, seeded);

    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(rebuildWork(engine)).toEqual([]);

    corrupt(engine, occurrenceRow(engine, LATER), { status: 'cancelled', sequence: 2 });
    await seedRebuild(engine, seeded);
    events.failUpsertUid = SERIES.uid;
    await sync(engine, seeded);
    await sync(engine, seeded);
    expect(rebuildWork(engine).length).toBeGreaterThan(0);
    await sync(engine, seeded);
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('restarts a mailbox whose UIDVALIDITY changed while collecting', async () => {
    const engine = createTestEngine({ calendar: { inviteBackfillBatch: 1 } });
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    deliverAt(engine, seeded, 'later', instance('11-30', { sequence: 1, dtstamp: at(11) }), day(2));
    await sync(engine, seeded);
    corrupt(engine, occurrenceRow(engine, LATER), { status: 'cancelled', sequence: 2 });
    await seedInbox(engine, seeded);
    seeded.server.fetchedCalendarParts.length = 0;

    await sync(engine, seeded);
    seeded.server.resetUidValidity('INBOX');
    for (let run = 0; run < 4; run += 1) {
      await sync(engine, seeded);
    }

    expect(
      seeded.server.fetchedCalendarParts.filter((fetched) => fetched.path === 'INBOX')[1],
    ).toEqual({ path: 'INBOX', uid: 1 });
    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('restarts a mailbox whose UIDVALIDITY was unknown when its cursor was written', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    deliverAt(engine, seeded, 'later', instance('11-30', { sequence: 1, dtstamp: at(11) }), day(2));
    await sync(engine, seeded);
    corrupt(engine, occurrenceRow(engine, LATER), { status: 'cancelled', sequence: 2 });
    const inbox = present(
      [...engine.db.tables.mailboxes.values()].find((mailbox) => mailbox.role === 'inbox'),
    );
    await engine.repositories.pendingWork.put({
      accountId: seeded.account.id,
      kind: 'calendar-rebuild',
      ref: inbox.id,
      payload: { mailboxId: inbox.id, afterUid: 2, uidValidity: null },
      createdAt: day(9),
    });

    await sync(engine, seeded);

    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(rebuildWork(engine)).toEqual([]);
  });
});

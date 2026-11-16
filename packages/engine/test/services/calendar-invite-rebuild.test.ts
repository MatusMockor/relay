import {
  CalendarEventIdSchema,
  CalendarSubscriptionIdSchema,
  GoogleCalendarIdSchema,
  MessageIdSchema,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ME, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { cancelOne, instance, master, occurrenceRow, rows } from '../support/range-invites';
import {
  corrupt,
  deliverAt,
  rebuildWork,
  seedRebuild,
  snapshot,
  sync,
} from '../support/rebuild-invites';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const LATER = '2026-11-30T09:00:00.000Z';
const SECOND = '2026-12-07T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
const day = (date: number): string => `2026-11-0${String(date)}T08:00:00.000Z`;

const masterRow = (engine: TestEngine) => rows(engine).find((row) => row.recurrenceId === null);

const seedSeries = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
  deliverAt(engine, seeded, 'later', instance('11-30', { sequence: 1, dtstamp: at(11) }), day(2));
  deliverAt(engine, seeded, 'second', instance('12-07', { sequence: 1, dtstamp: at(11) }), day(3));
  await sync(engine, seeded);
  return seeded;
};

const breakLikeAnOldVersion = (engine: TestEngine) => {
  const cancel = { status: 'cancelled' as const, method: 'CANCEL' as const, sequence: 2 };
  const messageId = MessageIdSchema.parse('msg-cancel');
  corrupt(engine, occurrenceRow(engine, LATER), { ...cancel, dtstamp: at(12), messageId });
  corrupt(engine, occurrenceRow(engine, SECOND), { ...cancel, dtstamp: at(12), messageId });
  corrupt(engine, masterRow(engine), { messageId });
};

const rebuilt = async (engine: TestEngine, seeded: SeededAccount) => {
  await seedRebuild(engine, seeded);
  await sync(engine, seeded);
};

describe('one-time rebuild of invitation series from their mails', () => {
  it('restores what an old version overwrote and keeps the local RSVP', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    const later = present(occurrenceRow(engine, LATER));
    await engine.services.calendar.respond(USER_ID, later.id, 'accepted', 'UTC');
    const answered = present(occurrenceRow(engine, LATER));
    breakLikeAnOldVersion(engine);

    await rebuilt(engine, seeded);

    expect(occurrenceRow(engine, LATER)).toMatchObject({
      id: later.id,
      status: 'confirmed',
      sequence: 1,
      dtstamp: at(11),
      messageId: later.messageId,
      myPartstat: 'accepted',
    });
    const me = occurrenceRow(engine, LATER)?.attendees.find((entry) => entry.email === ME.email);
    expect(me).toMatchObject({
      partstat: 'accepted',
      repliedAt: answered.attendees.find((entry) => entry.email === ME.email)?.repliedAt,
    });
    expect(occurrenceRow(engine, SECOND)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(masterRow(engine)?.messageId).not.toBe('msg-cancel');
    expect(rebuildWork(engine)).toEqual([]);

    const revisions = rows(engine).map((row) => row.revision);
    await rebuilt(engine, seeded);
    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
  });

  it('collects in bounded batches and rewrites nothing until every mailbox is read', async () => {
    const engine = createTestEngine({ calendar: { inviteBackfillBatch: 2 } });
    const seeded = await seedSeries(engine);
    breakLikeAnOldVersion(engine);
    const broken = snapshot(engine);
    await seedRebuild(engine, seeded);

    await sync(engine, seeded);

    expect(snapshot(engine)).toEqual(broken);
    expect(seeded.server.fetchedCalendarParts.map((fetched) => fetched.uid)).toEqual([1, 2]);
    expect(rebuildWork(engine).some((work) => work.kind === 'calendar-rebuild-part')).toBe(true);

    await sync(engine, seeded);

    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(seeded.server.fetchedCalendarParts.map((fetched) => fetched.uid)).toEqual([1, 2, 3]);
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('pauses on a provider error and resumes from its cursor', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    breakLikeAnOldVersion(engine);
    const broken = snapshot(engine);
    await seedRebuild(engine, seeded);
    seeded.server.failFetchUid = 3;

    await sync(engine, seeded);

    expect(snapshot(engine)).toEqual(broken);
    const inbox = await engine.repositories.pendingWork.find({
      accountId: seeded.account.id,
      kind: 'calendar-rebuild',
      ref: present(
        [...engine.db.tables.mailboxes.values()].find((mailbox) => mailbox.role === 'inbox'),
      ).id,
    });
    expect(inbox?.payload.afterUid).toBe(2);
    seeded.server.failFetchUid = null;

    await sync(engine, seeded);

    expect(occurrenceRow(engine, SECOND)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('skips a message that is gone from the server and keeps the rows it alone created', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    breakLikeAnOldVersion(engine);
    seeded.server.mailboxes.get('INBOX')?.messages.delete(3);

    await rebuilt(engine, seeded);

    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(occurrenceRow(engine, SECOND)).toMatchObject({ status: 'cancelled', sequence: 2 });
    expect(rebuildWork(engine)).toEqual([]);
  });

  it('rebuilds a series whose mails live in several mailboxes', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1), 'Archive');
    deliverAt(engine, seeded, 'later', instance('11-30', { sequence: 1, dtstamp: at(11) }), day(2));
    deliverAt(
      engine,
      seeded,
      'all',
      cancelOne(LATER, { recurrenceId: null, sequence: 1, dtstamp: at(12) }),
      day(3),
      'Archive',
    );
    deliverAt(engine, seeded, 'restore', master({ sequence: 2, dtstamp: at(13) }), day(4));
    await sync(engine, seeded);
    corrupt(engine, occurrenceRow(engine, LATER), { status: 'cancelled', sequence: 1 });

    await rebuilt(engine, seeded);

    expect(masterRow(engine)).toMatchObject({ status: 'confirmed', sequence: 2 });
    expect(occurrenceRow(engine, LATER)).toMatchObject({
      status: 'confirmed',
      sequence: 1,
      dtstamp: at(11),
    });
    expect(new Set(seeded.server.fetchedCalendarParts.map((fetched) => fetched.path))).toEqual(
      new Set(['INBOX', 'Archive']),
    );
  });

  it('re-derives a REPLY parked before the upgrade from its mail', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const colleague = { name: null, email: 'jana@partner.test', role: null };
    const reply = instance('11-23', {
      sequence: 1,
      dtstamp: at(12),
      thisAndFuture: true,
      attendees: [{ ...colleague, partstat: 'accepted' }],
    });
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(1));
    deliverAt(engine, seeded, 'reply', { method: 'REPLY', events: reply.events }, day(2));
    await sync(engine, seeded);
    const parked = [...engine.db.tables.pendingWork.values()].filter(
      (work) => work.kind === 'calendar-reply',
    );
    expect(parked).toHaveLength(1);
    engine.db.tables.pendingWork.clear();
    deliverAt(
      engine,
      seeded,
      'range',
      instance('11-23', {
        sequence: 1,
        dtstamp: at(11),
        thisAndFuture: true,
        attendees: [{ ...colleague, partstat: 'needs-action' }],
      }),
      day(3),
    );
    await sync(engine, seeded);
    const range = present(rows(engine).find((row) => row.thisAndFuture === true));
    expect(range.attendees[0]?.partstat).toBe('needs-action');

    await rebuilt(engine, seeded);

    const restored = present(rows(engine).find((row) => row.id === range.id));
    expect(restored.attendees[0]).toMatchObject({ partstat: 'accepted' });
  });

  it('never touches Google or subscription rows', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    const template = present(masterRow(engine));
    const foreign = [
      {
        ...template,
        id: CalendarEventIdSchema.parse('evt_feed'),
        source: {
          kind: 'subscription' as const,
          subscriptionId: CalendarSubscriptionIdSchema.parse('sub_1'),
        },
        revision: 4,
      },
      {
        ...template,
        id: CalendarEventIdSchema.parse('evt_google'),
        source: { kind: 'google' as const, calendarId: GoogleCalendarIdSchema.parse('gcal_1') },
        status: 'cancelled' as const,
        revision: 7,
      },
    ];
    foreign.forEach((row) => engine.db.tables.calendarEvents.set(row.id, row));

    await rebuilt(engine, seeded);

    expect(foreign.map((row) => engine.db.tables.calendarEvents.get(row.id))).toEqual(foreign);
  });
});

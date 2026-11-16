import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { type StoredCalendarEvent, ValidationError } from '../../src';
import { seedAccount } from '../support/fixtures';
import {
  cancelOne,
  deliver,
  instance,
  master,
  occurrenceRow,
  rows,
} from '../support/range-invites';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const FIRST = '2026-11-30T09:00:00.000Z';
const SECOND = '2026-12-07T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;

const wholeSeriesCancel = (sequence: number, dtstamp: string) =>
  cancelOne(FIRST, { recurrenceId: null, sequence, dtstamp });

const masterRow = (engine: TestEngine) => rows(engine).find((row) => row.recurrenceId === null);

const cardOf = async (engine: TestEngine, row: StoredCalendarEvent | undefined) => {
  const cards = await engine.services.calendar.invitations(
    USER_ID,
    row?.threadId as ThreadId,
    ZONE,
  );
  return cards.find((card) => card.eventId === row?.id);
};

const respond = (engine: TestEngine, row: StoredCalendarEvent | undefined) =>
  engine.services.calendar.respond(USER_ID, row?.id as CalendarEventId, 'accepted', ZONE);

const seedInstances = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  await deliver(engine, seeded, 'first', instance('11-30', { sequence: 1, dtstamp: at(10) }));
  await deliver(engine, seeded, 'second', instance('12-07', { sequence: 1, dtstamp: at(10) }));
  return seeded;
};

describe('whole-series CANCEL of a series known only from instance invitations', () => {
  it('stores a cancelled master and leaves the instance rows to a later master', async () => {
    const engine = createTestEngine();
    const seeded = await seedInstances(engine);
    await deliver(engine, seeded, 'all', wholeSeriesCancel(1, at(11)));

    expect(masterRow(engine)).toMatchObject({
      status: 'cancelled',
      recurring: false,
      sequence: 1,
      startsAt: '2026-11-30T13:00:00.000Z',
    });
    expect(occurrenceRow(engine, FIRST)).toMatchObject({ status: 'confirmed', sequence: 1 });
    expect(await cardOf(engine, occurrenceRow(engine, FIRST))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    expect(await cardOf(engine, masterRow(engine))).toMatchObject({ status: 'cancelled' });
    await expect(respond(engine, occurrenceRow(engine, SECOND))).rejects.toBeInstanceOf(
      ValidationError,
    );
    const revisions = rows(engine).map((row) => row.revision);
    await deliver(engine, seeded, 'all-replay', wholeSeriesCancel(1, at(11)));
    await deliver(
      engine,
      seeded,
      'first-replay',
      instance('11-30', { sequence: 1, dtstamp: at(10) }),
    );
    await deliver(engine, seeded, 'old-master', master({ sequence: 0, dtstamp: at(9) }));
    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);

    await deliver(engine, seeded, 'resent', instance('12-07', { sequence: 1, dtstamp: at(12) }));
    expect(await cardOf(engine, occurrenceRow(engine, SECOND))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
    const tombstone = masterRow(engine);
    await deliver(engine, seeded, 'restore', master({ sequence: 2, dtstamp: at(13) }));

    expect(masterRow(engine)).toMatchObject({
      id: tombstone?.id,
      status: 'confirmed',
      recurring: true,
      sequence: 2,
    });
    expect(await cardOf(engine, occurrenceRow(engine, FIRST))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('ignores an untimed whole-series CANCEL of a series it knows nothing about', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'all', wholeSeriesCancel(1, at(11)));

    expect(rows(engine)).toEqual([]);
  });
});

describe('instance CANCEL without DTSTART for an instance without a row', () => {
  it('stores a cancelled occurrence with the times of the known master', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(engine, seeded, 'stale', cancelOne(FIRST, { sequence: 3, dtstamp: at(9) }));
    expect(occurrenceRow(engine, FIRST)).toBeUndefined();

    await deliver(engine, seeded, 'cancel', cancelOne(FIRST, { sequence: 1, dtstamp: at(11) }));

    expect(occurrenceRow(engine, FIRST)).toMatchObject({
      status: 'cancelled',
      recurring: false,
      allDay: false,
      startsAt: FIRST,
      endsAt: '2026-11-30T10:00:00.000Z',
    });
    expect(await cardOf(engine, occurrenceRow(engine, FIRST))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    const revisions = rows(engine).map((row) => row.revision);
    await deliver(engine, seeded, 'replay', cancelOne(FIRST, { sequence: 1, dtstamp: at(11) }));
    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
  });

  it('keeps the cancellation of an instance whose series arrives later and takes its times', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const timedAt = '2026-12-07T09:00:00.000Z';
    await deliver(
      engine,
      seeded,
      'cancel',
      cancelOne(FIRST, { sequence: 1, dtstamp: at(11), ics: 'cancel' }),
    );
    await deliver(
      engine,
      seeded,
      'timed-cancel',
      cancelOne(timedAt, {
        sequence: 1,
        dtstamp: at(11),
        timed: true,
        startsAt: timedAt,
        endsAt: timedAt,
        ics: 'timed-cancel',
      }),
    );
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(engine, seeded, 'old-instance', instance('11-30', { dtstamp: at(9) }));

    expect(occurrenceRow(engine, FIRST)).toMatchObject({
      status: 'cancelled',
      startsAt: FIRST,
      endsAt: '2026-11-30T10:00:00.000Z',
    });
    expect(occurrenceRow(engine, timedAt)).toMatchObject({ startsAt: timedAt, endsAt: timedAt });
    expect(masterRow(engine)).toMatchObject({ status: 'confirmed' });
  });
});

import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { StoredCalendarEvent } from '../../src';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { seedAccount } from '../support/fixtures';
import {
  byRecurrence,
  cancelFrom,
  cancelOne,
  CUT,
  cutKey,
  cutRow,
  deliver,
  instance,
  master,
  occurrenceRow,
  rangeKey,
  rangeRow,
  rows,
  SERIES,
  stampAt,
} from '../support/range-invites';
import { createTestEngine, USER_ID } from '../support/test-engine';
import type { TestEngine } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const LATER = '2026-11-30T09:00:00.000Z';

const COLLEAGUE = 'kolega@partner.test';

const rangeReply = calendarOf(
  'REPLY',
  eventData({
    ...SERIES,
    recurring: false,
    recurrenceId: CUT,
    thisAndFuture: true,
    sequence: 1,
    dtstamp: '2026-11-16T08:00:00.000Z',
    attendees: [{ name: null, email: COLLEAGUE, partstat: 'accepted', role: null }],
  }),
);

const colleagueOf = (row: StoredCalendarEvent | undefined) =>
  row?.attendees.find((attendee) => attendee.email === COLLEAGUE)?.partstat;

const cardOf = async (engine: TestEngine, row: StoredCalendarEvent | undefined) => {
  const cards = await engine.services.calendar.invitations(
    USER_ID,
    row?.threadId as ThreadId,
    ZONE,
  );
  return cards.find((card) => card.eventId === row?.id);
};

describe('THISANDFUTURE range records next to occurrence rows', () => {
  it('restores only the instance when a newer REQUEST arrives exactly at the cut', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cut', cancelFrom(CUT));
    await deliver(engine, seeded, 'older-at-cut', instance('11-23'));
    await deliver(engine, seeded, 'at-cut', instance('11-23', { sequence: 2 }));
    await deliver(engine, seeded, 'stale-after', instance('11-30', { sequence: 1 }));
    await deliver(engine, seeded, 'cut-copy', cancelFrom(CUT));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['confirmed', undefined, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
      [LATER]: ['confirmed', undefined, undefined],
    });
    expect(await cardOf(engine, occurrenceRow(engine, CUT))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
  });

  it('keeps a late cut next to a newer instance REQUEST at the same recurrence id', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'at-cut', instance('11-23', { sequence: 2 }));
    await deliver(engine, seeded, 'late-cut', cancelFrom(CUT));
    await deliver(engine, seeded, 'stale-after', instance('11-30'));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['confirmed', undefined, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
      [LATER]: ['confirmed', undefined, undefined],
    });
  });

  it('lifts a cut only with a strictly newer range request at the same anchor', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cut', cancelFrom(CUT, { sequence: 2 }));
    await deliver(
      engine,
      seeded,
      'same-revision',
      instance('11-23', { sequence: 2, dtstamp: stampAt(2, '30'), thisAndFuture: true }),
    );
    expect(cutRow(engine, CUT)).toMatchObject({ endsSeries: true, sequence: 2 });
    expect(await cardOf(engine, rangeRow(engine, CUT))).toMatchObject({ status: 'cancelled' });

    await deliver(engine, seeded, 'lift', instance('11-23', { sequence: 3, thisAndFuture: true }));
    await deliver(engine, seeded, 'cut-replay', cancelFrom(CUT, { sequence: 2 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [rangeKey(CUT)]: ['confirmed', true, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
    });
    expect(rangeRow(engine, CUT)?.sequence).toBe(3);
    expect(await cardOf(engine, rangeRow(engine, CUT))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('changes only the anchor instance when a plain REQUEST arrives at a range anchor', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(
      engine,
      seeded,
      'range',
      instance('11-23', { sequence: 1, thisAndFuture: true, summary: 'Porada o 14:00' }),
    );
    await deliver(engine, seeded, 'anchor', instance('11-23', { sequence: 2, summary: 'Iba raz' }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['confirmed', undefined, undefined],
      [rangeKey(CUT)]: ['confirmed', true, undefined],
    });
    expect(occurrenceRow(engine, CUT)).toMatchObject({ summary: 'Iba raz', sequence: 2 });
    expect(rangeRow(engine, CUT)).toMatchObject({ summary: 'Porada o 14:00', sequence: 1 });
  });

  it('keeps the anchor instance when its range request arrives later', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'anchor', instance('11-23', { sequence: 2, summary: 'Iba raz' }));
    await deliver(
      engine,
      seeded,
      'range',
      instance('11-23', { sequence: 1, thisAndFuture: true, summary: 'Porada o 14:00' }),
    );
    const revisions = rows(engine).map((row) => row.revision);
    await deliver(
      engine,
      seeded,
      'range-copy',
      instance('11-23', { sequence: 1, thisAndFuture: true, summary: 'Porada o 14:00' }),
    );

    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
    expect(occurrenceRow(engine, CUT)).toMatchObject({ summary: 'Iba raz', sequence: 2 });
    expect(rangeRow(engine, CUT)).toMatchObject({ summary: 'Porada o 14:00', sequence: 1 });
  });

  it('answers a range whose anchor alone is cancelled', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));
    await deliver(engine, seeded, 'anchor-cancel', cancelOne(CUT, { sequence: 2 }));
    const range = rangeRow(engine, CUT);

    expect(await cardOf(engine, range)).toMatchObject({ status: 'confirmed', canRespond: true });
    expect(await cardOf(engine, occurrenceRow(engine, CUT))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    await engine.services.calendar.respond(USER_ID, range?.id as CalendarEventId, 'accepted', ZONE);

    expect(engine.calendar.replyBuilder.built.map((input) => input.event.id)).toEqual([range?.id]);
    expect(rangeRow(engine, CUT)).toMatchObject({ myPartstat: 'accepted', status: 'confirmed' });
    expect(occurrenceRow(engine, CUT)).toMatchObject({ status: 'cancelled' });
  });

  it('cancels only the master with the whole series and shows its records as cancelled', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));
    await deliver(engine, seeded, 'cut', cancelFrom(LATER, { sequence: 2 }));
    await deliver(
      engine,
      seeded,
      'all',
      cancelOne(LATER, { recurrenceId: null, sequence: 3, timed: true }),
    );

    expect(byRecurrence(engine)).toEqual({
      master: ['cancelled', undefined, undefined],
      [rangeKey(CUT)]: ['confirmed', true, undefined],
      [cutKey(LATER)]: ['cancelled', true, true],
    });
    expect(cutRow(engine, LATER)?.sequence).toBe(2);
    expect(rangeRow(engine, CUT)?.sequence).toBe(1);
    expect(rows(engine).find((row) => row.recurrenceId === null)?.sequence).toBe(3);
    expect(await cardOf(engine, rangeRow(engine, CUT))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
  });

  it('parks a REPLY to a range and applies it to the range record only', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'reply', rangeReply);
    await deliver(engine, seeded, 'anchor', instance('11-23', { sequence: 1 }));

    expect(colleagueOf(occurrenceRow(engine, CUT))).toBeUndefined();
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));

    expect(colleagueOf(rangeRow(engine, CUT))).toBe('accepted');
    expect(colleagueOf(occurrenceRow(engine, CUT))).toBeUndefined();
    expect(
      [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'calendar-reply'),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { ParsedCalendar, ParsedCalendarEvent, StoredCalendarEvent } from '../../src';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const deliver = async (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
): Promise<void> => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
};

const rows = (engine: TestEngine): StoredCalendarEvent[] =>
  [...engine.db.tables.calendarEvents.values()].sort((a, b) =>
    (a.recurrenceId ?? '').localeCompare(b.recurrenceId ?? ''),
  );

const byRecurrence = (engine: TestEngine) =>
  Object.fromEntries(
    rows(engine).map((row) => [
      row.recurrenceId ?? 'master',
      [row.status, row.thisAndFuture, row.endsSeries],
    ]),
  );

const SERIES = {
  uid: 'weekly@partner.test',
  recurring: true,
  rangeEndsAt: null,
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-02T10:00:00.000Z',
};

const master = (overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf('REQUEST', eventData({ ...SERIES, ...overrides }));

const instance = (day: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf(
    'REQUEST',
    eventData({
      ...SERIES,
      recurring: false,
      recurrenceId: `2026-${day}T09:00:00.000Z`,
      startsAt: `2026-${day}T13:00:00.000Z`,
      endsAt: `2026-${day}T14:00:00.000Z`,
      rangeEndsAt: `2026-${day}T14:00:00.000Z`,
      ...overrides,
    }),
  );

const cancelFrom = (recurrenceId: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf(
    'CANCEL',
    eventData({
      ...SERIES,
      timed: false,
      recurring: false,
      recurrenceId,
      thisAndFuture: true,
      sequence: 1,
      dtstamp: '2026-11-15T09:00:00.000Z',
      status: 'cancelled',
      ...overrides,
    }),
  );

const CUT = '2026-11-23T09:00:00.000Z';

describe('THISANDFUTURE cancellations of invitations', () => {
  it('cancels the cut and later overrides, keeps earlier ones and their threads', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ summary: 'Porada' }));
    await deliver(engine, seeded, 'before', instance('11-09'));
    await deliver(engine, seeded, 'after', instance('11-30'));
    const afterMessage = rows(engine).find((row) => row.recurrenceId?.startsWith('2026-11-30'));
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT, { summary: '' }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      '2026-11-09T09:00:00.000Z': ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', true, true],
      '2026-11-30T09:00:00.000Z': ['cancelled', undefined, undefined],
    });
    const cancelled = rows(engine);
    const tombstone = cancelled.find((row) => row.recurrenceId === CUT);
    const later = cancelled.find((row) => row.recurrenceId?.startsWith('2026-11-30'));
    expect(later?.messageId).toBe(afterMessage?.messageId);
    expect(tombstone?.messageId).not.toBe(afterMessage?.messageId);
    expect(tombstone).toMatchObject({ method: 'CANCEL', sequence: 1, summary: 'Porada' });
    expect(engine.events.ofType('calendar.updated').length).toBeGreaterThan(0);
  });

  it('is idempotent when the same cancellation is ingested again', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'after', instance('11-30'));
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT));
    const revisions = rows(engine).map((row) => row.revision);
    const published = engine.events.ofType('calendar.updated').length;

    await deliver(engine, seeded, 'cancel-copy', cancelFrom(CUT));

    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
    expect(engine.events.ofType('calendar.updated')).toHaveLength(published);
  });

  it('keeps the cut when the cancellation arrives before the series and its overrides', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT));
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'stale-after', instance('11-30'));
    await deliver(engine, seeded, 'stale-at-cut', instance('11-23'));
    await deliver(engine, seeded, 'before', instance('11-16'));
    await deliver(engine, seeded, 'newer-after', instance('12-07', { sequence: 2 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      '2026-11-16T09:00:00.000Z': ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', true, true],
      '2026-12-07T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
  });

  it('ignores a cancellation older than the series', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ sequence: 2 }));
    await deliver(engine, seeded, 'after', instance('11-30', { sequence: 2 }));
    await deliver(engine, seeded, 'old-cancel', cancelFrom(CUT));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      '2026-11-30T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
  });

  it('cancels the whole series when the cut is at its first occurrence', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cancel', cancelFrom(SERIES.startsAt));

    expect(byRecurrence(engine)).toEqual({
      master: ['cancelled', undefined, undefined],
      [SERIES.startsAt]: ['cancelled', true, true],
    });
    expect(rows(engine).every((row) => row.method === 'CANCEL')).toBe(true);
  });

  it('keeps the cut when the cut instance is cancelled again on its own', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT));
    await deliver(
      engine,
      seeded,
      'instance-cancel',
      cancelFrom(CUT, { thisAndFuture: false, sequence: 2 }),
    );

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', true, true],
    });
    expect(rows(engine).find((row) => row.recurrenceId === CUT)?.sequence).toBe(2);
  });

  it('keeps the range change when only its anchor occurrence is cancelled', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));
    await deliver(
      engine,
      seeded,
      'anchor-cancel',
      cancelFrom(CUT, { thisAndFuture: false, sequence: 2 }),
    );

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', true, undefined],
    });
  });

  it('accepts only a newer range request after a cut and lets it restore later instances', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT));
    await deliver(
      engine,
      seeded,
      'stale-range',
      instance('11-30', { sequence: 1, thisAndFuture: true }),
    );
    await deliver(
      engine,
      seeded,
      'restore',
      instance('12-07', { sequence: 2, thisAndFuture: true }),
    );
    await deliver(engine, seeded, 'restored-instance', instance('12-14', { sequence: 2 }));
    await deliver(engine, seeded, 'still-cut', instance('11-30', { sequence: 1 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', true, true],
      '2026-12-07T09:00:00.000Z': ['confirmed', true, undefined],
      '2026-12-14T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
  });
});

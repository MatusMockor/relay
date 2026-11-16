import { describe, expect, it } from 'vitest';
import type { ThreadId } from '@relay/shared/domain';
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
  rows,
  SERIES,
} from '../support/range-invites';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('THISANDFUTURE cancellations of invitations', () => {
  it('cancels the cut and shows later older overrides as cancelled on their own cards', async () => {
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
      [cutKey(CUT)]: ['cancelled', true, true],
      '2026-11-30T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
    const tombstone = cutRow(engine, CUT);
    expect(tombstone?.messageId).not.toBe(afterMessage?.messageId);
    const cards = await engine.services.calendar.invitations(
      USER_ID,
      afterMessage?.threadId as ThreadId,
      'Europe/Bratislava',
    );
    expect(cards.find((card) => card.eventId === afterMessage?.id)).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
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
      [CUT]: ['confirmed', undefined, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
      '2026-11-30T09:00:00.000Z': ['confirmed', undefined, undefined],
      '2026-12-07T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
    const stale = occurrenceRow(engine, '2026-11-30T09:00:00.000Z');
    const cards = await engine.services.calendar.invitations(
      USER_ID,
      stale?.threadId as ThreadId,
      'Europe/Bratislava',
    );
    expect(cards.find((card) => card.eventId === stale?.id)).toMatchObject({
      status: 'cancelled',
      canRespond: false,
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
      [cutKey(SERIES.startsAt)]: ['cancelled', true, true],
    });
    expect(rows(engine).every((row) => row.method === 'CANCEL')).toBe(true);
  });

  it('keeps the cut when the cut instance is cancelled again on its own', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT));
    await deliver(engine, seeded, 'instance-cancel', cancelOne(CUT, { sequence: 2 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', undefined, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
    });
    expect(occurrenceRow(engine, CUT)?.sequence).toBe(2);
    expect(cutRow(engine, CUT)?.sequence).toBe(1);
  });
});

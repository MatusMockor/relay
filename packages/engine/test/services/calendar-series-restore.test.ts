import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { type StoredCalendarEvent, ValidationError } from '../../src';
import { seedAccount } from '../support/fixtures';
import {
  byRecurrence,
  cancelFrom,
  cancelOne,
  CUT,
  cutKey,
  deliver,
  instance,
  master,
  occurrenceRow,
  rangeKey,
  rangeRow,
  rows,
} from '../support/range-invites';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const LATER = '2026-11-30T09:00:00.000Z';
const DROPPED = '2026-12-07T09:00:00.000Z';

const wholeSeriesCancel = (sequence: number) =>
  cancelOne(CUT, { recurrenceId: null, sequence, timed: true });

const cardOf = async (engine: TestEngine, row: StoredCalendarEvent | undefined) => {
  const cards = await engine.services.calendar.invitations(
    USER_ID,
    row?.threadId as ThreadId,
    ZONE,
  );
  return cards.find((card) => card.eventId === row?.id);
};

const statuses = async (engine: TestEngine) => ({
  range: (await cardOf(engine, rangeRow(engine, CUT)))?.status,
  later: (await cardOf(engine, occurrenceRow(engine, LATER)))?.status,
  dropped: (await cardOf(engine, occurrenceRow(engine, DROPPED)))?.status,
});

const seedSeries = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  await deliver(engine, seeded, 'series', master());
  await deliver(
    engine,
    seeded,
    'range',
    instance('11-23', { sequence: 1, thisAndFuture: true, summary: 'Porada o 14:00' }),
  );
  await deliver(engine, seeded, 'later', instance('11-30', { sequence: 1, summary: 'Presunutá' }));
  await deliver(engine, seeded, 'dropped', instance('12-07', { sequence: 1 }));
  await deliver(engine, seeded, 'dropped-cancel', cancelOne(DROPPED, { sequence: 1 }));
  return seeded;
};

describe('series restored by a newer master', () => {
  it('brings back the records a whole-series CANCEL hid and keeps individual cancellations', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    await deliver(engine, seeded, 'all', wholeSeriesCancel(2));

    expect(byRecurrence(engine)).toMatchObject({
      master: ['cancelled', undefined, undefined],
      [rangeKey(CUT)]: ['confirmed', true, undefined],
      [LATER]: ['confirmed', undefined, undefined],
    });
    expect(await statuses(engine)).toEqual({
      range: 'cancelled',
      later: 'cancelled',
      dropped: 'cancelled',
    });
    await expect(
      engine.services.calendar.respond(
        USER_ID,
        rangeRow(engine, CUT)?.id as CalendarEventId,
        'accepted',
        ZONE,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await deliver(engine, seeded, 'restore', master({ sequence: 3 }));
    const revisions = rows(engine).map((row) => row.revision);
    await deliver(engine, seeded, 'all-replay', wholeSeriesCancel(2));

    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
    expect(await statuses(engine)).toEqual({
      range: 'confirmed',
      later: 'confirmed',
      dropped: 'cancelled',
    });
    expect(occurrenceRow(engine, LATER)).toMatchObject({ summary: 'Presunutá', sequence: 1 });
    await engine.services.calendar.respond(
      USER_ID,
      rangeRow(engine, CUT)?.id as CalendarEventId,
      'accepted',
      ZONE,
    );
    expect(engine.calendar.replyBuilder.built.map((input) => input.event.id)).toEqual([
      rangeRow(engine, CUT)?.id,
    ]);
  });

  it('ignores a whole-series CANCEL that arrives after the newer master', async () => {
    const engine = createTestEngine();
    const seeded = await seedSeries(engine);
    await deliver(engine, seeded, 'restore', master({ sequence: 3 }));
    await deliver(engine, seeded, 'late-all', wholeSeriesCancel(2));
    await deliver(engine, seeded, 'late-instance', instance('12-14', { sequence: 1 }));

    expect(byRecurrence(engine)).toMatchObject({ master: ['confirmed', undefined, undefined] });
    expect(await statuses(engine)).toEqual({
      range: 'confirmed',
      later: 'confirmed',
      dropped: 'cancelled',
    });
    expect(await cardOf(engine, occurrenceRow(engine, '2026-12-14T09:00:00.000Z'))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('keeps an older instance delivered after the whole-series CANCEL until the restore', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'all', wholeSeriesCancel(2));
    await deliver(engine, seeded, 'late', instance('11-30', { sequence: 1 }));
    await deliver(engine, seeded, 'resent', instance('12-14', { sequence: 3 }));

    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'cancelled',
    });
    expect(await cardOf(engine, occurrenceRow(engine, '2026-12-14T09:00:00.000Z'))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });

    await deliver(engine, seeded, 'restore', master({ sequence: 4 }));

    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('brings back what a cut hid, in either delivery order, once a newer master supersedes it', async () => {
    for (const cutFirst of [false, true]) {
      const engine = createTestEngine();
      const seeded = await seedAccount(engine);
      await deliver(engine, seeded, 'series', master());
      if (cutFirst) {
        await deliver(engine, seeded, 'cut', cancelFrom(CUT, { sequence: 2 }));
      }
      await deliver(
        engine,
        seeded,
        'range',
        instance('11-23', { sequence: 1, thisAndFuture: true, summary: 'Porada o 14:00' }),
      );
      await deliver(engine, seeded, 'later', instance('11-30', { sequence: 1 }));
      await deliver(engine, seeded, 'dropped', instance('12-07', { sequence: 1 }));
      await deliver(engine, seeded, 'dropped-cancel', cancelOne(DROPPED, { sequence: 1 }));
      if (!cutFirst) {
        await deliver(engine, seeded, 'cut', cancelFrom(CUT, { sequence: 2 }));
      }

      expect(byRecurrence(engine)).toMatchObject({
        [rangeKey(CUT)]: ['confirmed', true, undefined],
        [cutKey(CUT)]: ['cancelled', true, true],
      });
      expect(await statuses(engine)).toEqual({
        range: 'cancelled',
        later: 'cancelled',
        dropped: 'cancelled',
      });

      await deliver(engine, seeded, 'extended', master({ sequence: 3 }));
      const revisions = rows(engine).map((row) => row.revision);
      await deliver(engine, seeded, 'cut-replay', cancelFrom(CUT, { sequence: 2 }));

      expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
      expect(await statuses(engine)).toEqual({
        range: 'confirmed',
        later: 'confirmed',
        dropped: 'cancelled',
      });
      expect(rangeRow(engine, CUT)).toMatchObject({ summary: 'Porada o 14:00', sequence: 1 });
    }
  });
});

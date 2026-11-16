import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src';
import { deliverMail, seedAccount } from '../support/fixtures';
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
  stampAt,
} from '../support/range-invites';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('THISANDFUTURE range precedence of invitations', () => {
  it('keeps the range change when only its anchor occurrence is cancelled', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));
    await deliver(engine, seeded, 'anchor-cancel', cancelOne(CUT, { sequence: 2 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [CUT]: ['cancelled', undefined, undefined],
      [rangeKey(CUT)]: ['confirmed', true, undefined],
    });
  });

  it('keeps older requests behind a cut hidden and lets a newer range restore later instances', async () => {
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
      [cutKey(CUT)]: ['cancelled', true, true],
      '2026-11-30T09:00:00.000Z': ['confirmed', undefined, undefined],
      [rangeKey('2026-11-30T09:00:00.000Z')]: ['confirmed', true, undefined],
      [rangeKey('2026-12-07T09:00:00.000Z')]: ['confirmed', true, undefined],
      '2026-12-14T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
    const stale = rangeRow(engine, '2026-11-30T09:00:00.000Z');
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

  it('keeps the range revision of a range request whose anchor is cancelled', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'range', instance('11-23', { sequence: 1, thisAndFuture: true }));
    await deliver(
      engine,
      seeded,
      'later-range',
      instance('11-30', { sequence: 2, thisAndFuture: true }),
    );
    await deliver(engine, seeded, 'anchor-cancel', cancelOne(CUT, { sequence: 3 }));

    expect(occurrenceRow(engine, CUT)).toMatchObject({ status: 'cancelled', sequence: 3 });
    expect(rangeRow(engine, CUT)).toMatchObject({
      status: 'confirmed',
      method: 'REQUEST',
      sequence: 1,
      dtstamp: stampAt(1),
    });
  });

  it('hides an override that any applying cut supersedes', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const secondCut = '2026-12-07T09:00:00.000Z';
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'first-cut', cancelFrom(CUT));
    await deliver(engine, seeded, 'between', instance('12-14', { sequence: 2 }));
    await deliver(engine, seeded, 'second-cut', cancelFrom(secondCut, { sequence: 3 }));
    await deliver(engine, seeded, 'behind-both', instance('12-21', { sequence: 2 }));

    expect(byRecurrence(engine)).toEqual({
      master: ['confirmed', undefined, undefined],
      [cutKey(CUT)]: ['cancelled', true, true],
      [cutKey(secondCut)]: ['cancelled', true, true],
      '2026-12-14T09:00:00.000Z': ['confirmed', undefined, undefined],
      '2026-12-21T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
    const cardOf = async (recurrenceId: string) => {
      const row = occurrenceRow(engine, recurrenceId);
      const cards = await engine.services.calendar.invitations(
        USER_ID,
        row?.threadId as ThreadId,
        'Europe/Bratislava',
      );
      return cards.find((card) => card.eventId === row?.id)?.status;
    };
    expect(await cardOf('2026-12-14T09:00:00.000Z')).toBe('cancelled');
    expect(await cardOf('2026-12-21T09:00:00.000Z')).toBe('cancelled');
  });

  it('refuses an RSVP for an override that a newer cut hides before replying', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'later', instance('11-30', { sequence: 1 }));
    await deliver(engine, seeded, 'cancel', cancelFrom(CUT, { sequence: 2 }));
    const hidden = rows(engine).find((row) => row.recurrenceId === '2026-11-30T09:00:00.000Z');

    await expect(
      engine.services.calendar.respond(
        USER_ID,
        hidden?.id as CalendarEventId,
        'accepted',
        'Europe/Bratislava',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(engine.calendar.replyBuilder.built).toEqual([]);
    expect(rows(engine).find((row) => row.id === hidden?.id)).toMatchObject({
      status: 'confirmed',
      myPartstat: hidden?.myPartstat,
    });
  });

  it('applies invitations synced together in their arrival order', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const uids = Array.from({ length: 30 }, (_, index) => `pair-${String(index)}@partner.test`);
    for (const uid of uids) {
      const request = `${uid}-range`;
      const cancel = `${uid}-cancel`;
      engine.calendar.parser.register(
        request,
        instance('11-23', { uid, sequence: 1, thisAndFuture: true }),
      );
      engine.calendar.parser.register(cancel, cancelOne(CUT, { uid, sequence: 2 }));
      deliverMail(seeded.server, 'INBOX', { id: request, headers: { 'X-Test-Calendar': request } });
      deliverMail(seeded.server, 'INBOX', { id: cancel, headers: { 'X-Test-Calendar': cancel } });
    }
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);

    const occurrences = rows(engine).filter((row) => row.thisAndFuture !== true);
    const ranges = rows(engine).filter((row) => row.thisAndFuture === true);
    expect(occurrences.map((row) => [row.uid, row.status]).sort()).toEqual(
      uids.map((uid) => [uid, 'cancelled']).sort(),
    );
    expect(ranges.map((row) => [row.uid, row.status]).sort()).toEqual(
      uids.map((uid) => [uid, 'confirmed']).sort(),
    );
  });

  it('keeps the cut revision when the cut anchor is cancelled again after a lift', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cut', cancelFrom(CUT));
    await deliver(engine, seeded, 'lift', instance('11-30', { sequence: 2, thisAndFuture: true }));
    await deliver(engine, seeded, 'restored', instance('12-07', { sequence: 2 }));
    await deliver(engine, seeded, 'anchor-again', cancelOne(CUT, { sequence: 3 }));
    await deliver(engine, seeded, 'late', instance('12-14', { sequence: 2 }));

    expect(cutRow(engine, CUT)).toMatchObject({
      sequence: 1,
      dtstamp: stampAt(1, '30'),
      endsSeries: true,
    });
    expect(occurrenceRow(engine, CUT)).toMatchObject({ status: 'cancelled', sequence: 3 });
    expect(rows(engine).some((row) => row.recurrenceId === '2026-12-14T09:00:00.000Z')).toBe(true);
    const restored = rows(engine).find((row) => row.recurrenceId === '2026-12-07T09:00:00.000Z');
    const cards = await engine.services.calendar.invitations(
      USER_ID,
      restored?.threadId as ThreadId,
      'Europe/Bratislava',
    );
    expect(cards.find((card) => card.eventId === restored?.id)).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });
});

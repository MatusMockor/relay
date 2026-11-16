import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src';
import { deliverMail, seedAccount } from '../support/fixtures';
import {
  byRecurrence,
  cancelFrom,
  CUT,
  deliver,
  instance,
  master,
  rows,
} from '../support/range-invites';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('THISANDFUTURE range precedence of invitations', () => {
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
    await deliver(
      engine,
      seeded,
      'anchor-cancel',
      cancelFrom(CUT, { thisAndFuture: false, sequence: 3 }),
    );

    const anchor = rows(engine).find((row) => row.recurrenceId === CUT);
    expect(anchor).toMatchObject({
      status: 'cancelled',
      sequence: 3,
      thisAndFuture: true,
      rangeRevision: { sequence: 1, dtstamp: '2026-11-15T07:00:00.000Z' },
    });
  });

  it('rejects an override that any applying cut supersedes', async () => {
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
      [CUT]: ['cancelled', true, true],
      [secondCut]: ['cancelled', true, true],
      '2026-12-14T09:00:00.000Z': ['confirmed', undefined, undefined],
    });
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
      engine.calendar.parser.register(
        cancel,
        cancelFrom(CUT, { uid, thisAndFuture: false, sequence: 2 }),
      );
      deliverMail(seeded.server, 'INBOX', { id: request, headers: { 'X-Test-Calendar': request } });
      deliverMail(seeded.server, 'INBOX', { id: cancel, headers: { 'X-Test-Calendar': cancel } });
    }
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);

    expect(rows(engine)).toHaveLength(uids.length);
    expect(rows(engine).filter((row) => row.status !== 'cancelled')).toEqual([]);
  });

  it('keeps the cut revision when the cut anchor is cancelled again after a lift', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master());
    await deliver(engine, seeded, 'cut', cancelFrom(CUT));
    await deliver(engine, seeded, 'lift', instance('11-30', { sequence: 2, thisAndFuture: true }));
    await deliver(engine, seeded, 'restored', instance('12-07', { sequence: 2 }));
    await deliver(
      engine,
      seeded,
      'anchor-again',
      cancelFrom(CUT, { thisAndFuture: false, sequence: 3 }),
    );
    await deliver(engine, seeded, 'late', instance('12-14', { sequence: 2 }));

    expect(rows(engine).find((row) => row.recurrenceId === CUT)).toMatchObject({
      sequence: 3,
      endsSeries: true,
      rangeRevision: { sequence: 1, dtstamp: '2026-11-15T09:00:00.000Z' },
    });
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

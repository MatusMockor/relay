import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { type StoredCalendarEvent, ValidationError } from '../../src';
import { ORGANIZER } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { ME, seedAccount } from '../support/fixtures';
import {
  cancelFrom,
  cancelOne,
  CUT,
  cutRow,
  deliver,
  instance,
  master,
  occurrenceRow,
  rangeRow,
  rows,
  SERIES,
} from '../support/range-invites';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const LATER = '2026-11-30T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;

const wholeSeriesCancel = (sequence: number, dtstamp: string) =>
  cancelOne(CUT, { recurrenceId: null, sequence, dtstamp, timed: true });

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

const connectGoogleCopy = async (engine: TestEngine) => {
  engine.google.gateway.put(
    'alice@example.com',
    remoteEvent({
      remoteId: 'copy',
      uid: SERIES.uid,
      summary: 'Porada',
      organizer: ORGANIZER,
      myPartstat: 'needs-action',
      attendees: [
        { ...ORGANIZER, partstat: 'accepted', role: null },
        { name: ME.name, email: ME.email, partstat: 'needs-action', role: null },
      ],
    }),
  );
  engine.google.gateway.calendars.push(remoteCalendar());
  await engine.services.googleCalendar.connect(USER_ID, {
    email: 'alice@example.com',
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
};

describe('revision order across components of an invitation series', () => {
  it('cancels an instance edited more often than the series with a later whole-series CANCEL', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(engine, seeded, 'edited', instance('11-30', { sequence: 5, dtstamp: at(11) }));
    await deliver(engine, seeded, 'all', wholeSeriesCancel(1, at(12)));
    await deliver(engine, seeded, 'resent', instance('12-07', { sequence: 0, dtstamp: at(13) }));

    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    await expect(respond(engine, occurrenceRow(engine, LATER))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(engine.sender.sent).toEqual([]);
    expect(await cardOf(engine, occurrenceRow(engine, '2026-12-07T09:00:00.000Z'))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });

    const revisions = rows(engine).map((row) => row.revision);
    await deliver(engine, seeded, 'all-replay', wholeSeriesCancel(1, at(12)));
    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);

    await deliver(engine, seeded, 'restore', master({ sequence: 1, dtstamp: at(14) }));
    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('refuses the Google-first RSVP of an instance older than the cancelled series', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(engine, seeded, 'edited', instance('11-30', { sequence: 5, dtstamp: at(11) }));
    await deliver(engine, seeded, 'all', wholeSeriesCancel(1, at(12)));
    await connectGoogleCopy(engine);

    await expect(respond(engine, occurrenceRow(engine, LATER))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(engine.google.gateway.writes).toEqual([]);
    expect(engine.sender.sent).toEqual([]);
  });

  it('decides a cut against the series by DTSTAMP, not by SEQUENCE', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ sequence: 4, dtstamp: at(10) }));
    await deliver(engine, seeded, 'later', instance('11-30', { sequence: 4, dtstamp: at(10) }));
    await deliver(engine, seeded, 'cut', cancelFrom(CUT, { sequence: 1, dtstamp: at(11) }));

    expect(cutRow(engine, CUT)).toMatchObject({ endsSeries: true, sequence: 1 });
    expect(await cardOf(engine, occurrenceRow(engine, LATER))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });

    const stale = createTestEngine();
    const staleSeeded = await seedAccount(stale);
    await deliver(stale, staleSeeded, 'series', master({ sequence: 1, dtstamp: at(12) }));
    await deliver(stale, staleSeeded, 'cut', cancelFrom(CUT, { sequence: 6, dtstamp: at(11) }));

    expect(cutRow(stale, CUT)).toBeUndefined();
  });

  it('lifts a cut with a later range request of a lower SEQUENCE', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(engine, seeded, 'cut', cancelFrom(CUT, { sequence: 4, dtstamp: at(11) }));
    await deliver(
      engine,
      seeded,
      'lift',
      instance('11-30', { sequence: 1, dtstamp: at(12), thisAndFuture: true }),
    );

    expect(await cardOf(engine, rangeRow(engine, LATER))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('stores an instance CANCEL without a row only when it is not older than the series', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ sequence: 3, dtstamp: at(12) }));
    await deliver(
      engine,
      seeded,
      'stale',
      cancelOne(LATER, { sequence: 5, dtstamp: at(11), timed: true }),
    );
    expect(occurrenceRow(engine, LATER)).toBeUndefined();

    await deliver(
      engine,
      seeded,
      'fresh',
      cancelOne(LATER, { sequence: 0, dtstamp: at(13), timed: true }),
    );
    expect(occurrenceRow(engine, LATER)).toMatchObject({ status: 'cancelled', sequence: 0 });
  });

  it('keeps SEQUENCE first for revisions of the same instance', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'series', master({ dtstamp: at(10) }));
    await deliver(
      engine,
      seeded,
      'second',
      instance('11-30', { sequence: 2, dtstamp: at(11), summary: 'Druhá verzia' }),
    );
    await deliver(
      engine,
      seeded,
      'first',
      instance('11-30', { sequence: 1, dtstamp: at(12), summary: 'Prvá verzia' }),
    );

    expect(occurrenceRow(engine, LATER)).toMatchObject({ summary: 'Druhá verzia', sequence: 2 });
  });

  it('keeps the series cut at its start under a replayed older master', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const start = SERIES.startsAt;
    const masterRow = () => rows(engine).find((row) => row.recurrenceId === null);
    await deliver(engine, seeded, 'series', master({ sequence: 4, dtstamp: at(10) }));
    await deliver(engine, seeded, 'cut', cancelFrom(start, { sequence: 1, dtstamp: at(11) }));

    expect(masterRow()).toMatchObject({ status: 'confirmed', sequence: 4, dtstamp: at(10) });
    expect(cutRow(engine, start)).toMatchObject({ sequence: 1, dtstamp: at(11) });
    expect(await cardOf(engine, masterRow())).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    await deliver(engine, seeded, 'series-replay', master({ sequence: 4, dtstamp: at(10) }));
    const revisions = rows(engine).map((row) => row.revision);
    await deliver(
      engine,
      seeded,
      'cut-replay',
      cancelFrom(start, { sequence: 1, dtstamp: at(11) }),
    );

    expect(rows(engine).map((row) => row.revision)).toEqual(revisions);
    expect(await cardOf(engine, masterRow())).toMatchObject({ status: 'cancelled' });
    await expect(respond(engine, masterRow())).rejects.toBeInstanceOf(ValidationError);

    await deliver(engine, seeded, 'restore', master({ sequence: 5, dtstamp: at(12) }));
    expect(await cardOf(engine, masterRow())).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('restores the series with a later master whose SEQUENCE is lower than the cut', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const masterRow = () => rows(engine).find((row) => row.recurrenceId === null);
    await deliver(engine, seeded, 'series', master({ sequence: 4, dtstamp: at(10) }));
    await deliver(
      engine,
      seeded,
      'cut',
      cancelFrom(SERIES.startsAt, { sequence: 10, dtstamp: at(11) }),
    );
    expect(await cardOf(engine, masterRow())).toMatchObject({ status: 'cancelled' });

    await deliver(engine, seeded, 'restore', master({ sequence: 5, dtstamp: at(12) }));
    expect(await cardOf(engine, masterRow())).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });
});

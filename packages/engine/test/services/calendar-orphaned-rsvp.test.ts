import type { CalendarEventId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, type StoredCalendarEvent, ValidationError } from '../../src';
import { ORGANIZER } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { ME, present, seedAccount } from '../support/fixtures';
import { deliver, instance, master, occurrenceRow, SERIES } from '../support/range-invites';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';
const PRIMARY = 'alice@example.com';
const DROPPED = '2026-11-30T09:00:00.000Z';
const SHORTENED_END = '2026-11-20T10:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;

const ATTENDEES = [
  { ...ORGANIZER, partstat: 'accepted' as const, role: null },
  { name: ME.name, email: ME.email, partstat: 'needs-action' as const, role: null },
];

const cardOf = async (engine: TestEngine, row: StoredCalendarEvent | undefined) => {
  const cards = await engine.services.calendar.invitations(
    USER_ID,
    row?.threadId as ThreadId,
    ZONE,
  );
  return cards.find((card) => card.eventId === row?.id);
};

const connectGoogle = async (engine: TestEngine) => {
  engine.google.gateway.calendars.push(remoteCalendar());
  await engine.services.googleCalendar.connect(USER_ID, {
    email: PRIMARY,
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
};

const seedShortened = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  await deliver(engine, seeded, 'edited', instance('11-30', { sequence: 5, dtstamp: at(10) }));
  await deliver(
    engine,
    seeded,
    'shortened',
    master({ sequence: 1, dtstamp: at(12), rangeEndsAt: SHORTENED_END }),
  );
  return seeded;
};

describe('RSVP to an override that is no longer an occurrence of its series', () => {
  it('refuses the invitation on the card, over iMIP and over the Google-first path', async () => {
    const engine = createTestEngine();
    const seeded = await seedShortened(engine);
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({
        remoteId: 'copy',
        uid: SERIES.uid,
        organizer: ORGANIZER,
        attendees: ATTENDEES,
      }),
    );
    await connectGoogle(engine);

    expect(await cardOf(engine, occurrenceRow(engine, DROPPED))).toMatchObject({
      status: 'cancelled',
      canRespond: false,
    });
    await expect(
      engine.services.calendar.respond(
        USER_ID,
        occurrenceRow(engine, DROPPED)?.id as CalendarEventId,
        'accepted',
        ZONE,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(engine.sender.sent).toEqual([]);
    expect(engine.google.gateway.writes).toEqual([]);

    await deliver(engine, seeded, 'resent', instance('11-30', { sequence: 6, dtstamp: at(13) }));
    expect(await cardOf(engine, occurrenceRow(engine, DROPPED))).toMatchObject({
      status: 'confirmed',
      canRespond: true,
    });
  });

  it('refuses a Google exception older than the shortened Google series', async () => {
    const engine = createTestEngine();
    const series = remoteEvent({
      remoteId: 'series',
      uid: 'series@google.com',
      organizer: ORGANIZER,
      attendees: ATTENDEES,
      myPartstat: 'needs-action',
      recurring: true,
      startsAt: '2026-11-02T09:00:00.000Z',
      endsAt: '2026-11-02T10:00:00.000Z',
    });
    const exception = remoteEvent({
      remoteId: 'series_20261130',
      uid: 'series@google.com',
      recurringRemoteId: 'series',
      recurrenceId: DROPPED,
      organizer: ORGANIZER,
      attendees: ATTENDEES,
      myPartstat: 'needs-action',
      startsAt: '2026-11-30T13:00:00.000Z',
      endsAt: '2026-11-30T14:00:00.000Z',
    });
    engine.google.gateway.put(PRIMARY, {
      ...series,
      data: { ...series.data, sequence: 1, dtstamp: at(12), rangeEndsAt: SHORTENED_END },
    });
    engine.google.gateway.put(PRIMARY, {
      ...exception,
      data: { ...exception.data, sequence: 5, dtstamp: at(10) },
    });
    await connectGoogle(engine);
    const stored = present(
      [...engine.db.tables.calendarEvents.values()].find((row) => row.recurrenceId === DROPPED),
    );

    await expect(
      engine.services.googleCalendar.respond(USER_ID, stored.id, 'accepted'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(engine.google.gateway.writes).toEqual([]);
  });
});

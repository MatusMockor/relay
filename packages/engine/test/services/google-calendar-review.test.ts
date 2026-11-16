import { describe, expect, it } from 'vitest';
import { GoogleChangeApplier } from '../../src/services/google-calendar/google-change-applier';
import { calendarOf, DAY_WINDOW, eventData, ORGANIZER } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PRIMARY = 'alice@example.com';
const ZONE = 'Europe/Bratislava';

const connect = async (engine: TestEngine) => {
  engine.google.gateway.calendars.push(remoteCalendar());
  return engine.services.googleCalendar.connect(USER_ID, {
    email: PRIMARY,
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
};

const invitedAs = (remoteId: string, uid: string, email: string) =>
  remoteEvent({
    remoteId,
    uid,
    summary: 'Kópia',
    organizer: ORGANIZER,
    myPartstat: 'needs-action',
    myEmail: email,
    attendees: [{ name: null, email, partstat: 'needs-action', role: null }],
  });

describe('Google calendar review regressions', () => {
  it('keeps the email invitation and iMIP when the Google copy belongs to another attendee', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
    deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const invite = present([...engine.db.tables.calendarEvents.values()][0]);
    engine.google.gateway.put(PRIMARY, invitedAs('copy', invite.uid, 'alice.private@gmail.test'));
    await connect(engine);

    const shown = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(shown.map((entry) => entry.sourceKind).sort()).toEqual(['google', 'invite']);
    await engine.services.calendar.respond(USER_ID, invite.id, 'accepted', ZONE);
    expect(engine.google.gateway.writes).toEqual([]);
    expect(engine.sender.sent).toHaveLength(1);
    expect(ME.email).toBe(invite.myEmail);
  });

  it('deletes the whole series when deleting from an overridden instance', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({
        remoteId: 'series',
        uid: 'series@google.com',
        recurring: true,
        summary: 'Séria',
      }),
    );
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({
        remoteId: 'series_1',
        uid: 'series@google.com',
        recurringRemoteId: 'series',
        recurrenceId: '2026-11-16T09:00:00.000Z',
        summary: 'Presunutá',
        startsAt: '2026-11-16T13:00:00.000Z',
        endsAt: '2026-11-16T14:00:00.000Z',
      }),
    );
    await connect(engine);
    const moved = present(
      (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).find(
        (entry) => entry.title === 'Presunutá',
      ),
    );

    await engine.services.googleCalendar.deleteEvent(USER_ID, moved.eventId);

    expect(engine.google.gateway.writes).toEqual(['delete series']);
    expect(engine.db.tables.calendarEvents.size).toBe(0);
  });

  it('marks only the instance cancelled when an answered instance vanished on Google', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({ remoteId: 'weekly', uid: 'weekly@partner.test', recurring: true }),
    );
    engine.google.gateway.put(PRIMARY, {
      ...invitedAs('weekly_1', 'weekly@partner.test', PRIMARY),
      recurringRemoteId: 'weekly',
      data: {
        ...invitedAs('weekly_1', 'weekly@partner.test', PRIMARY).data,
        recurrenceId: '2026-11-16T09:00:00.000Z',
      },
    });
    await connect(engine);
    const instance = present(
      [...engine.db.tables.calendarEvents.values()].find((row) => row.recurrenceId !== null),
    );
    engine.google.gateway.events.get(PRIMARY)?.delete('weekly_1');

    await expect(
      engine.services.googleCalendar.respond(USER_ID, instance.id, 'accepted'),
    ).rejects.toMatchObject({ code: 'not_found' });

    const rows = [...engine.db.tables.calendarEvents.values()];
    expect(rows.map((row) => [row.recurrenceId, row.status])).toEqual([
      [null, 'confirmed'],
      ['2026-11-16T09:00:00.000Z', 'cancelled'],
    ]);
  });

  it('resolves a cancelled exception that arrives before its new master in one incremental batch', async () => {
    const engine = createTestEngine();
    const connection = await connect(engine);
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({
        remoteId: 'late_1',
        uid: null,
        recurringRemoteId: 'late',
        recurrenceId: '2026-11-23T09:00:00.000Z',
        status: 'cancelled',
      }),
    );
    engine.google.gateway.put(
      PRIMARY,
      remoteEvent({ remoteId: 'late', uid: 'late@google.com', recurring: true }),
    );

    await engine.services.googleCalendar.sync(USER_ID, connection.id);

    const rows = [...engine.db.tables.calendarEvents.values()];
    expect(rows.map((row) => [row.uid, row.recurrenceId, row.status])).toEqual([
      ['late@google.com', null, 'confirmed'],
      ['late@google.com', '2026-11-23T09:00:00.000Z', 'cancelled'],
    ]);
  });

  it('fails a full sync over the event cap without replacing events', async () => {
    const engine = createTestEngine();
    await connect(engine);
    const calendar = present([...engine.db.tables.googleCalendars.values()][0]);
    const applier = new GoogleChangeApplier(engine.ids, 1);
    const changes = ['a', 'b'].map((remoteId) => ({
      kind: 'event' as const,
      event: remoteEvent({ remoteId }),
    }));

    await expect(
      engine.unitOfWork.run((repositories) =>
        applier.replaceAll(repositories, calendar, changes, '2026-11-15T10:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(engine.db.tables.calendarEvents.size).toBe(0);
  });
});

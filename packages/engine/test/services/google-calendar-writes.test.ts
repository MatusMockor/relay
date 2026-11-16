import { describe, expect, it } from 'vitest';
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

const invited = (remoteId: string, uid = `${remoteId}@google.com`) =>
  remoteEvent({
    remoteId,
    uid,
    summary: 'Pozvánka',
    organizer: ORGANIZER,
    myPartstat: 'needs-action',
    attendees: [
      { ...ORGANIZER, partstat: 'accepted', role: null },
      { name: ME.name, email: ME.email, partstat: 'needs-action', role: null },
    ],
  });

const connect = async (engine: TestEngine) => {
  engine.google.gateway.calendars.push(
    remoteCalendar(),
    remoteCalendar({ remoteId: 'holidays', name: 'Sviatky', primary: false, accessRole: 'reader' }),
  );
  return engine.services.googleCalendar.connect(USER_ID, {
    email: PRIMARY,
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
};

const occurrence = async (engine: TestEngine, title: string) =>
  present(
    (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).find(
      (entry) => entry.title === title,
    ),
  );

describe('Google calendar writes', () => {
  it('answers a Google invitation and retries once after an ETag conflict', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, invited('inv'));
    await connect(engine);
    const before = await occurrence(engine, 'Pozvánka');
    expect(before).toMatchObject({ canRespond: true, canDelete: false, myStatus: 'needs-action' });
    engine.google.gateway.put(PRIMARY, invited('inv'));

    await engine.services.googleCalendar.respond(USER_ID, before.eventId, 'accepted');

    expect(engine.google.gateway.writes).toEqual(['rsvp inv accepted', 'rsvp inv accepted']);
    const after = await occurrence(engine, 'Pozvánka');
    expect(after.myStatus).toBe('accepted');
    const remote = present(engine.google.gateway.events.get(PRIMARY)?.get('inv'));
    expect(remote.data.attendees.find((entry) => entry.email === ME.email)?.partstat).toBe(
      'accepted',
    );
  });

  it('routes the RSVP of an email invitation through Google instead of iMIP', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
    deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const invite = present(
      [...engine.db.tables.calendarEvents.values()].find((row) => row.source.kind === 'invite'),
    );
    engine.google.gateway.put(PRIMARY, invited('copy', invite.uid));
    await connect(engine);

    const invitation = await engine.services.calendar.respond(USER_ID, invite.id, 'declined', ZONE);

    expect(invitation.myStatus).toBe('declined');
    expect(engine.sender.sent).toEqual([]);
    expect(engine.google.gateway.writes).toEqual(['rsvp copy declined']);
    const shown = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(shown.map((entry) => [entry.sourceKind, entry.myStatus])).toEqual([
      ['google', 'declined'],
    ]);
  });

  it('falls back to iMIP when the Google copy cannot be answered', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
    deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const invite = present([...engine.db.tables.calendarEvents.values()][0]);
    engine.google.gateway.put('holidays', invited('copy', invite.uid));
    await connect(engine);

    await engine.services.calendar.respond(USER_ID, invite.id, 'accepted', ZONE);

    expect(engine.sender.sent).toHaveLength(1);
    expect(engine.google.gateway.writes).toEqual([]);
  });

  it('creates an event in a writable calendar and refuses read-only ones', async () => {
    const engine = createTestEngine();
    const connection = await connect(engine);
    const [primary, holidays] = connection.calendars;
    const body = {
      title: 'Obed',
      allDay: false,
      start: '2026-11-16T11:00:00.000Z',
      end: '2026-11-16T12:00:00.000Z',
      timeZone: ZONE,
      location: '',
      attendees: [],
    };

    const created = await engine.services.googleCalendar.createEvent(USER_ID, {
      ...body,
      calendarId: present(primary).id,
    });

    const shown = await occurrence(engine, 'Obed');
    expect(shown).toMatchObject({ eventId: created.eventId, canDelete: true, location: null });
    await expect(
      engine.services.googleCalendar.createEvent(USER_ID, {
        ...body,
        calendarId: present(holidays).id,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('deletes own events and reports an ETag conflict without deleting', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'own', summary: 'Moja' }));
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'stale', summary: 'Stará' }));
    engine.google.gateway.put(PRIMARY, invited('foreign'));
    await connect(engine);
    const own = await occurrence(engine, 'Moja');
    const stale = await occurrence(engine, 'Stará');
    const foreign = await occurrence(engine, 'Pozvánka');
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'stale', summary: 'Stará 2' }));

    await engine.services.googleCalendar.deleteEvent(USER_ID, own.eventId);
    await expect(
      engine.services.googleCalendar.deleteEvent(USER_ID, stale.eventId),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      engine.services.googleCalendar.deleteEvent(USER_ID, foreign.eventId),
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect(engine.google.gateway.events.get(PRIMARY)?.has('own')).toBe(false);
    expect(engine.google.gateway.events.get(PRIMARY)?.has('stale')).toBe(true);
    const titles = (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).map(
      (entry) => entry.title,
    );
    expect(titles.sort()).toEqual(['Pozvánka', 'Stará 2']);
  });

  it('treats an already deleted Google event as removed', async () => {
    const engine = createTestEngine();
    engine.google.gateway.put(PRIMARY, remoteEvent({ remoteId: 'gone', summary: 'Preč' }));
    await connect(engine);
    const gone = await occurrence(engine, 'Preč');
    engine.google.gateway.events.get(PRIMARY)?.delete('gone');

    await engine.services.googleCalendar.deleteEvent(USER_ID, gone.eventId);

    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
    expect(engine.db.tables.calendarEvents.get(gone.eventId)).toBeUndefined();
  });
});

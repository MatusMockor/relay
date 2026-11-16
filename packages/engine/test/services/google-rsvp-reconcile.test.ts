import type { CalendarEventId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { calendarOf, DAY_WINDOW, eventData, ORGANIZER } from '../support/calendar-fixtures';
import {
  CALENDAR_SCOPE,
  googleCredentials,
  remoteCalendar,
  remoteEvent,
} from '../support/fakes/google-event-fixtures';
import { deliverMail, ME, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { MemoryCalendarEventRepository } from '../support/memory/memory-calendar-repositories';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PRIMARY = 'alice@example.com';
const ZONE = 'Europe/Bratislava';

const googleCopy = (uid: string) =>
  remoteEvent({
    remoteId: 'copy',
    uid,
    summary: 'Pozvánka',
    organizer: ORGANIZER,
    myPartstat: 'needs-action',
    attendees: [
      { ...ORGANIZER, partstat: 'accepted', role: null },
      { name: ME.name, email: ME.email, partstat: 'needs-action', role: null },
    ],
  });

const seedInviteWithGoogleCopy = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
  deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const invite = present(
    [...engine.db.tables.calendarEvents.values()].find((row) => row.source.kind === 'invite'),
  );
  engine.google.gateway.calendars.push(remoteCalendar());
  engine.google.gateway.put(PRIMARY, googleCopy(invite.uid));
  await engine.services.googleCalendar.connect(USER_ID, {
    email: PRIMARY,
    credentials: googleCredentials(CALENDAR_SCOPE),
  });
  return { seeded, invite };
};

const storedInvite = (engine: TestEngine, id: CalendarEventId) =>
  present(engine.db.tables.calendarEvents.get(id));

const myAttendee = (engine: TestEngine, id: CalendarEventId) =>
  storedInvite(engine, id).attendees.find((attendee) => attendee.email === ME.email);

const deliverMyOlderReply = async (engine: TestEngine, seeded: SeededAccount) => {
  const reply = eventData({
    dtstamp: '2026-11-15T09:00:00.000Z',
    attendees: [{ name: ME.name, email: ME.email, partstat: 'tentative', role: null }],
  });
  engine.calendar.parser.register('old-reply', calendarOf('REPLY', reply));
  deliverMail(seeded.server, 'INBOX', {
    id: 'old-reply',
    headers: { 'X-Test-Calendar': 'old-reply' },
  });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
};

describe('Google-backed RSVP and the email invitation', () => {
  it('updates the email invitation when answering from the calendar pane', async () => {
    const engine = createTestEngine();
    const { seeded, invite } = await seedInviteWithGoogleCopy(engine);
    const google = present(
      (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).find(
        (entry) => entry.sourceKind === 'google',
      ),
    );
    engine.events.clear();

    await engine.services.googleCalendar.respond(USER_ID, google.eventId, 'accepted');

    expect(engine.google.gateway.writes).toEqual(['rsvp copy accepted']);
    expect(storedInvite(engine, invite.id).myPartstat).toBe('accepted');
    expect(myAttendee(engine, invite.id)).toMatchObject({
      partstat: 'accepted',
      repliedAt: engine.clock.now().toISOString(),
    });
    const cards = await engine.services.calendar.invitations(
      USER_ID,
      present(invite.threadId),
      ZONE,
    );
    expect(cards.map((card) => card.myStatus)).toEqual(['accepted']);
    expect(
      engine.events
        .ofType('calendar.updated')
        .some(
          (event) =>
            event.data.sourceKind === 'invite' && event.data.sourceId === seeded.account.id,
        ),
    ).toBe(true);
  });

  it('keeps a Google-backed answer from the mail card ahead of an older REPLY', async () => {
    const engine = createTestEngine();
    const { seeded, invite } = await seedInviteWithGoogleCopy(engine);

    await engine.services.calendar.respond(USER_ID, invite.id, 'declined', ZONE);

    expect(engine.sender.sent).toEqual([]);
    expect(myAttendee(engine, invite.id)?.repliedAt).toBe(engine.clock.now().toISOString());
    await deliverMyOlderReply(engine, seeded);

    expect(storedInvite(engine, invite.id).myPartstat).toBe('declined');
    expect(myAttendee(engine, invite.id)?.partstat).toBe('declined');
  });

  it('keeps a calendar pane answer ahead of an older REPLY', async () => {
    const engine = createTestEngine();
    const { seeded, invite } = await seedInviteWithGoogleCopy(engine);
    const google = present(
      (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).find(
        (entry) => entry.sourceKind === 'google',
      ),
    );

    await engine.services.googleCalendar.respond(USER_ID, google.eventId, 'declined');
    await deliverMyOlderReply(engine, seeded);

    expect(storedInvite(engine, invite.id).myPartstat).toBe('declined');
  });

  it('keeps the newer calendar pane answer when an older one reconciles last', async () => {
    const engine = createTestEngine();
    const { invite } = await seedInviteWithGoogleCopy(engine);
    const google = present(
      (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).find(
        (entry) => entry.sourceKind === 'google',
      ),
    );
    engine.google.gateway.afterWrite = async () => {
      engine.clock.advance(60_000);
      await engine.services.googleCalendar.respond(USER_ID, google.eventId, 'declined');
      engine.clock.advance(60_000);
    };

    await engine.services.googleCalendar.respond(USER_ID, google.eventId, 'accepted');

    const remote = present(engine.google.gateway.events.get(PRIMARY)?.get('copy'));
    expect(remote.myPartstat).toBe('declined');
    expect(storedInvite(engine, invite.id).myPartstat).toBe('declined');
    expect(myAttendee(engine, invite.id)?.partstat).toBe('declined');
  });

  it('keeps a Google-backed answer saved while a REPLY was being ingested', async () => {
    const engine = createTestEngine();
    const { seeded, invite } = await seedInviteWithGoogleCopy(engine);
    const events = engine.repositories.calendarEvents;
    expect(events).toBeInstanceOf(MemoryCalendarEventRepository);
    const memory = events as MemoryCalendarEventRepository;
    memory.beforeWrite = async () => {
      memory.beforeWrite = null;
      await engine.services.calendar.respond(USER_ID, invite.id, 'declined', ZONE);
    };
    const jana = { name: 'Jana Mala', email: 'jana@partner.test' };
    const reply = eventData({
      dtstamp: '2026-11-15T09:30:00.000Z',
      attendees: [{ ...jana, partstat: 'accepted', role: null }],
    });
    engine.calendar.parser.register('jana', calendarOf('REPLY', reply));
    deliverMail(seeded.server, 'INBOX', { id: 'jana', headers: { 'X-Test-Calendar': 'jana' } });

    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);

    expect(engine.google.gateway.writes).toEqual(['rsvp copy declined']);
    expect(storedInvite(engine, invite.id).myPartstat).toBe('declined');
    expect(myAttendee(engine, invite.id)?.partstat).toBe('declined');
    expect(
      storedInvite(engine, invite.id).attendees.find((entry) => entry.email === jana.email),
    ).toMatchObject({ partstat: 'accepted' });
  });
});

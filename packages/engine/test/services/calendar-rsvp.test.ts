import type { CalendarEventId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { calendarOf, eventData, ORGANIZER } from '../support/calendar-fixtures';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ZONE = 'Europe/Bratislava';

const seedInvite = async (engine: TestEngine, method: 'REQUEST' | 'PUBLISH' = 'REQUEST') => {
  const seeded = await seedAccount(engine);
  engine.calendar.parser.register('inv', calendarOf(method, eventData()));
  deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const event = present([...engine.db.tables.calendarEvents.values()][0]);
  return { ...seeded, eventId: event.id };
};

describe('Calendar RSVP', () => {
  it('sends an iMIP REPLY to the organizer and stores my PARTSTAT', async () => {
    const engine = createTestEngine();
    const { eventId } = await seedInvite(engine);

    const invitation = await engine.services.calendar.respond(USER_ID, eventId, 'accepted', ZONE);

    expect(invitation).toMatchObject({ myStatus: 'accepted', canRespond: true });
    const [sent] = engine.sender.sent;
    expect(sent?.message.to).toEqual([ORGANIZER]);
    expect(sent?.message.subject).toBe('Prijaté: Plánovanie Q1');
    expect(sent?.message.calendar).toEqual({
      method: 'REPLY',
      content: 'REPLY evt-1@partner.test alice@example.com accepted',
    });
    const stored = present(engine.db.tables.calendarEvents.get(eventId));
    expect(stored.myPartstat).toBe('accepted');
    expect(
      stored.attendees.find((attendee) => attendee.email === 'alice@example.com'),
    ).toMatchObject({ partstat: 'accepted', role: 'REQ-PARTICIPANT' });
    expect(engine.events.ofType('calendar.updated')).toHaveLength(1);
  });

  it('keeps the stored status when sending fails', async () => {
    const engine = createTestEngine();
    const { eventId } = await seedInvite(engine);
    engine.sender.failSend = 'SMTP down';

    await expect(
      engine.services.calendar.respond(USER_ID, eventId, 'declined', ZONE),
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(engine.db.tables.calendarEvents.get(eventId)?.myPartstat).toBe('needs-action');
  });

  it('refuses to answer published events and events of other users', async () => {
    const engine = createTestEngine();
    const { eventId } = await seedInvite(engine, 'PUBLISH');

    await expect(
      engine.services.calendar.respond(USER_ID, eventId, 'accepted', ZONE),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      engine.services.calendar.respond('user_bob' as typeof USER_ID, eventId, 'accepted', ZONE),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.calendar.respond(USER_ID, 'missing' as CalendarEventId, 'accepted', ZONE),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(engine.sender.sent).toHaveLength(0);
  });
});

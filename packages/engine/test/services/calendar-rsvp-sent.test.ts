import { describe, expect, it } from 'vitest';
import { calendarOf, eventData } from '../support/calendar-fixtures';
import { deliverMail, messageHeader, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('Calendar RSVP sent copy', () => {
  it('saves the REPLY to the Sent mailbox in the invitation thread', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
    deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const event = present([...engine.db.tables.calendarEvents.values()][0]);

    await engine.services.calendar.respond(USER_ID, event.id, 'accepted', 'Europe/Bratislava');

    const [sent] = engine.sender.sent;
    expect(sent?.message.inReplyTo).toBe(messageHeader('inv'));
    expect(seeded.server.find('Sent')?.messages.size).toBe(1);
    const copy = [...engine.db.tables.messages.values()].find(
      (message) => message.messageIdHeader === sent?.sent.messageIdHeader,
    );
    expect(copy?.threadId).toBe(event.threadId);
  });

  it('answers the invitation even when the Sent copy cannot be saved', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    engine.calendar.parser.register('inv', calendarOf('REQUEST', eventData()));
    deliverMail(seeded.server, 'INBOX', { id: 'inv', headers: { 'X-Test-Calendar': 'inv' } });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const event = present([...engine.db.tables.calendarEvents.values()][0]);
    seeded.server.failConnect = 'IMAP down';

    const invitation = await engine.services.calendar.respond(
      USER_ID,
      event.id,
      'declined',
      'Europe/Bratislava',
    );

    expect(invitation.myStatus).toBe('declined');
    expect(engine.sender.sent).toHaveLength(1);
  });
});

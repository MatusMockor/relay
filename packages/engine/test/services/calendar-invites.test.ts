import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { ParsedCalendar } from '../../src';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const deliverInvite = (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
  path = 'INBOX',
): void => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, path, {
    id,
    subject: `Pozvánka ${id}`,
    headers: { 'X-Test-Calendar': id },
  });
};

const sync = async (engine: TestEngine, seeded: SeededAccount): Promise<void> => {
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
};

describe('Calendar invitations from mail', () => {
  it('stores a REQUEST during sync and lists it with the account color', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await sync(engine, seeded);
    deliverInvite(engine, seeded, 'inv-1', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);

    const occurrences = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      title: 'Plánovanie Q1',
      sourceKind: 'invite',
      accountId: seeded.account.id,
      color: seeded.account.color,
      myStatus: 'needs-action',
      start: '2026-11-16T09:00:00.000Z',
    });
    expect(occurrences[0]?.threadId).not.toBeNull();
    expect(engine.events.ofType('calendar.updated')).toHaveLength(1);
  });

  it('applies updates by SEQUENCE and ignores stale copies', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverInvite(engine, seeded, 'v1', calendarOf('REQUEST', eventData()));
    deliverInvite(
      engine,
      seeded,
      'v2',
      calendarOf('REQUEST', eventData({ sequence: 2, summary: 'Plánovanie Q1 (presunuté)' })),
    );
    deliverInvite(
      engine,
      seeded,
      'v-stale',
      calendarOf('REQUEST', eventData({ sequence: 1, summary: 'Staré' })),
    );
    await sync(engine, seeded);

    const [occurrence] = await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW);
    expect(occurrence?.title).toBe('Plánovanie Q1 (presunuté)');
  });

  it('hides a cancelled event and shows the cancellation in the thread', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverInvite(engine, seeded, 'req', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);
    deliverInvite(engine, seeded, 'cancel', calendarOf('CANCEL', eventData({ sequence: 1 })));
    await sync(engine, seeded);

    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
    const event = [...engine.db.tables.calendarEvents.values()][0];
    expect(event).toMatchObject({ status: 'cancelled', method: 'CANCEL' });
    const invitations = await engine.services.calendar.invitations(
      USER_ID,
      event?.threadId as ThreadId,
      'Europe/Bratislava',
    );
    expect(invitations[0]).toMatchObject({ status: 'cancelled', canRespond: false });
  });

  it('records attendee replies when I am the organizer', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const me = { name: 'Alice Novak', email: seeded.account.email };
    const guest = { name: 'Jana', email: 'jana@partner.test' };
    deliverInvite(
      engine,
      seeded,
      'mine',
      calendarOf(
        'REQUEST',
        eventData({
          organizer: me,
          attendees: [
            { ...me, partstat: 'accepted', role: 'CHAIR' },
            { ...guest, partstat: 'needs-action', role: 'REQ-PARTICIPANT' },
          ],
        }),
      ),
      'Sent',
    );
    await sync(engine, seeded);
    deliverInvite(
      engine,
      seeded,
      'reply',
      calendarOf(
        'REPLY',
        eventData({ attendees: [{ ...guest, partstat: 'declined', role: null }], summary: '' }),
      ),
    );
    await sync(engine, seeded);

    const event = [...engine.db.tables.calendarEvents.values()][0];
    expect(event?.summary).toBe('Plánovanie Q1');
    expect(event?.attendees.find((attendee) => attendee.email === guest.email)?.partstat).toBe(
      'declined',
    );
  });

  it('ignores invitations in drafts and unparseable parts', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Drafts', 'drafts');
    deliverInvite(engine, seeded, 'draft', calendarOf('REQUEST', eventData()), 'Drafts');
    deliverMail(seeded.server, 'INBOX', { id: 'junk', headers: { 'X-Test-Calendar': 'nope' } });
    await sync(engine, seeded);

    expect(engine.db.tables.calendarEvents.size).toBe(0);
  });

  it('reports conflicts with other events on the invitation card', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverInvite(
      engine,
      seeded,
      'busy',
      calendarOf(
        'REQUEST',
        eventData({
          uid: 'other@partner.test',
          summary: 'Standup',
          startsAt: '2026-11-16T09:30:00.000Z',
          endsAt: '2026-11-16T09:45:00.000Z',
        }),
      ),
    );
    deliverInvite(engine, seeded, 'new', calendarOf('REQUEST', eventData()));
    await sync(engine, seeded);

    const event = [...engine.db.tables.calendarEvents.values()].find(
      (row) => row.uid === 'evt-1@partner.test',
    );
    const [invitation] = await engine.services.calendar.invitations(
      USER_ID,
      event?.threadId as ThreadId,
      'Europe/Bratislava',
    );
    expect(invitation).toMatchObject({ canRespond: true, myStatus: 'needs-action' });
    expect(invitation?.conflicts).toEqual([
      {
        title: 'Standup',
        start: '2026-11-16T09:30:00.000Z',
        end: '2026-11-16T09:45:00.000Z',
        allDay: false,
      },
    ]);
  });
});

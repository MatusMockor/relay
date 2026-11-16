import { describe, expect, it } from 'vitest';
import type { ParsedCalendar } from '../../src';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const deliver = async (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
): Promise<void> => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
};

const rows = (engine: TestEngine) => [...engine.db.tables.calendarEvents.values()];

const SERIES = {
  uid: 'weekly@partner.test',
  recurring: true,
  rangeEndsAt: null,
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-02T10:00:00.000Z',
};

describe('Calendar invitation precedence', () => {
  it('keeps a cancellation when a delayed copy of the request arrives', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'req', calendarOf('REQUEST', eventData({ sequence: 1 })));
    await deliver(
      engine,
      seeded,
      'cancel',
      calendarOf('CANCEL', eventData({ sequence: 1, dtstamp: '2026-11-15T09:00:00.000Z' })),
    );
    await deliver(
      engine,
      seeded,
      'late',
      calendarOf('REQUEST', eventData({ sequence: 1, dtstamp: '2026-11-15T08:00:00.000Z' })),
    );

    expect(rows(engine)[0]).toMatchObject({
      status: 'cancelled',
      dtstamp: '2026-11-15T09:00:00.000Z',
    });
    expect(await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW)).toEqual([]);
  });

  it('ignores a delayed instance cancellation older than the series', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(
      engine,
      seeded,
      'series',
      calendarOf('REQUEST', eventData({ ...SERIES, sequence: 2 })),
    );
    await deliver(
      engine,
      seeded,
      'old-cancel',
      calendarOf(
        'CANCEL',
        eventData({
          ...SERIES,
          recurring: false,
          sequence: 1,
          recurrenceId: '2026-11-16T09:00:00.000Z',
        }),
      ),
    );

    expect(rows(engine).map((row) => row.recurrenceId)).toEqual([null]);
  });

  it('applies cancellations and replies that carry no DTSTART', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await deliver(engine, seeded, 'req', calendarOf('REQUEST', eventData()));
    await deliver(
      engine,
      seeded,
      'bare-cancel',
      calendarOf('CANCEL', eventData({ timed: false, sequence: 1, summary: '' })),
    );

    expect(rows(engine)[0]).toMatchObject({ status: 'cancelled', summary: 'Plánovanie Q1' });
  });

  it('does not let an instance reply or a stale reply change the series', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    const me = { name: 'Alice Novak', email: seeded.account.email };
    const guest = { name: 'Jana', email: 'jana@partner.test' };
    const attendees = [
      { ...me, partstat: 'accepted' as const, role: null },
      { ...guest, partstat: 'needs-action' as const, role: null },
    ];
    await deliver(
      engine,
      seeded,
      'mine',
      calendarOf('REQUEST', eventData({ ...SERIES, sequence: 2, organizer: me, attendees })),
    );
    await deliver(
      engine,
      seeded,
      'instance-reply',
      calendarOf(
        'REPLY',
        eventData({
          ...SERIES,
          sequence: 2,
          recurrenceId: '2026-11-16T09:00:00.000Z',
          attendees: [{ ...guest, partstat: 'declined', role: null }],
        }),
      ),
    );
    await deliver(
      engine,
      seeded,
      'stale-reply',
      calendarOf(
        'REPLY',
        eventData({
          ...SERIES,
          sequence: 1,
          attendees: [{ ...guest, partstat: 'accepted', role: null }],
        }),
      ),
    );

    const [master] = rows(engine);
    expect(master?.attendees.find((attendee) => attendee.email === guest.email)?.partstat).toBe(
      'needs-action',
    );
  });
});

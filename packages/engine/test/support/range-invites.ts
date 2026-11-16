import type { ParsedCalendar, ParsedCalendarEvent, StoredCalendarEvent } from '../../src';
import { calendarOf, eventData } from './calendar-fixtures';
import { deliverMail, type SeededAccount } from './fixtures';
import { type TestEngine, USER_ID } from './test-engine';

export const deliver = async (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
): Promise<void> => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
};

export const rows = (engine: TestEngine): StoredCalendarEvent[] =>
  [...engine.db.tables.calendarEvents.values()].sort((a, b) =>
    (a.recurrenceId ?? '').localeCompare(b.recurrenceId ?? ''),
  );

export const byRecurrence = (engine: TestEngine) =>
  Object.fromEntries(
    rows(engine).map((row) => [
      row.recurrenceId ?? 'master',
      [row.status, row.thisAndFuture, row.endsSeries],
    ]),
  );

export const SERIES = {
  uid: 'weekly@partner.test',
  recurring: true,
  rangeEndsAt: null,
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-02T10:00:00.000Z',
};

export const master = (overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf('REQUEST', eventData({ ...SERIES, ...overrides }));

export const instance = (day: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf(
    'REQUEST',
    eventData({
      ...SERIES,
      recurring: false,
      recurrenceId: `2026-${day}T09:00:00.000Z`,
      startsAt: `2026-${day}T13:00:00.000Z`,
      endsAt: `2026-${day}T14:00:00.000Z`,
      rangeEndsAt: `2026-${day}T14:00:00.000Z`,
      ...overrides,
    }),
  );

export const cancelFrom = (recurrenceId: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf(
    'CANCEL',
    eventData({
      ...SERIES,
      timed: false,
      recurring: false,
      recurrenceId,
      thisAndFuture: true,
      sequence: 1,
      dtstamp: '2026-11-15T09:00:00.000Z',
      status: 'cancelled',
      ...overrides,
    }),
  );

export const CUT = '2026-11-23T09:00:00.000Z';

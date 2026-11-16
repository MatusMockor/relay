import {
  calendarRecurrenceKey,
  CUT_RECORD_SUFFIX,
  type ParsedCalendar,
  type ParsedCalendarEvent,
  RANGE_RECORD_SUFFIX,
  type StoredCalendarEvent,
} from '../../src';
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
    calendarRecurrenceKey(a).localeCompare(calendarRecurrenceKey(b)),
  );

export const rangeKey = (recurrenceId: string): string => `${recurrenceId}${RANGE_RECORD_SUFFIX}`;

export const cutKey = (recurrenceId: string): string => `${recurrenceId}${CUT_RECORD_SUFFIX}`;

export const occurrenceRow = (engine: TestEngine, recurrenceId: string) =>
  rows(engine).find((row) => calendarRecurrenceKey(row) === recurrenceId);

export const rangeRow = (engine: TestEngine, recurrenceId: string) =>
  rows(engine).find((row) => calendarRecurrenceKey(row) === rangeKey(recurrenceId));

export const cutRow = (engine: TestEngine, recurrenceId: string) =>
  rows(engine).find((row) => calendarRecurrenceKey(row) === cutKey(recurrenceId));

export const byRecurrence = (engine: TestEngine) =>
  Object.fromEntries(
    rows(engine).map((row) => [
      calendarRecurrenceKey(row) || 'master',
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

const cancelData = (recurrenceId: string, overrides: Partial<ParsedCalendarEvent>) =>
  eventData({
    ...SERIES,
    timed: false,
    recurring: false,
    recurrenceId,
    sequence: 1,
    dtstamp: '2026-11-15T09:00:00.000Z',
    status: 'cancelled',
    ...overrides,
  });

export const cancelFrom = (recurrenceId: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf('CANCEL', cancelData(recurrenceId, { thisAndFuture: true, ...overrides }));

export const cancelOne = (recurrenceId: string, overrides: Partial<ParsedCalendarEvent> = {}) =>
  calendarOf('CANCEL', cancelData(recurrenceId, overrides));

export const CUT = '2026-11-23T09:00:00.000Z';

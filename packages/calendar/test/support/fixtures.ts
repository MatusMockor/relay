import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CalendarEventData,
  CalendarSeries,
  ParsedCalendar,
  StoredCalendarEvent,
} from '@relay/engine';
import type { AccountId, CalendarEventId, UserId } from '@relay/shared/domain';
import { expect } from 'vitest';
import { IcalCalendarParser } from '../../src';

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', name), 'utf8');

export const parseFixture = (name: string): ParsedCalendar => {
  const parsed = new IcalCalendarParser().parse(fixture(name));
  expect(parsed).not.toBeNull();
  return parsed ?? { method: null, events: [] };
};

let counter = 0;

export const stored = (data: CalendarEventData): StoredCalendarEvent => {
  counter += 1;
  return {
    ...data,
    id: `evt_${String(counter)}` as CalendarEventId,
    userId: 'user_1' as UserId,
    source: { kind: 'invite', accountId: 'acc_1' as AccountId },
    method: 'REQUEST',
    myPartstat: null,
    myEmail: null,
    messageId: null,
    threadId: null,
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
    revision: 1,
  };
};

export const seriesOf = (events: readonly CalendarEventData[], uid: string): CalendarSeries => {
  const members = events.filter((event) => event.uid === uid).map(stored);
  return {
    master: members.find((member) => member.recurrenceId === null) ?? null,
    overrides: members.filter((member) => member.recurrenceId !== null),
  };
};

export const present = <Value>(value: Value | null | undefined): Value => {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  return value as Value;
};

export const firstEvent = (calendar: ParsedCalendar): CalendarEventData =>
  present(calendar.events[0]);

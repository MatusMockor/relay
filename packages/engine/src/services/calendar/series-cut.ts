import type { CalendarEventData, StoredCalendarEvent } from '../../model/calendar';
import { supersedes } from './event-precedence';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ZONED = /(?:Z|[+-]\d{2}:\d{2})$/;

export const recurrenceInstant = (key: string): number => {
  if (DATE_ONLY.test(key)) {
    return Date.parse(`${key}T00:00:00Z`);
  }
  return Date.parse(ZONED.test(key) ? key : `${key}Z`);
};

export const isMaster = (member: Pick<CalendarEventData, 'recurrenceId'>): boolean =>
  member.recurrenceId === null;

export const atOrAfter = (member: Pick<CalendarEventData, 'recurrenceId'>, from: number): boolean =>
  member.recurrenceId !== null && recurrenceInstant(member.recurrenceId) >= from;

const isRangeCut = (member: StoredCalendarEvent): boolean =>
  member.recurrenceId !== null && member.thisAndFuture === true && member.status === 'cancelled';

const instantOf = (member: StoredCalendarEvent): number =>
  recurrenceInstant(member.recurrenceId ?? '');

export const effectiveCut = (
  series: readonly StoredCalendarEvent[],
): StoredCalendarEvent | null => {
  const master = series.find(isMaster);
  return series
    .filter((member) => isRangeCut(member) && (master === undefined || supersedes(member, master)))
    .reduce<StoredCalendarEvent | null>(
      (earliest, member) =>
        earliest === null || instantOf(member) < instantOf(earliest) ? member : earliest,
      null,
    );
};

export const cutOffByRange = (
  series: readonly StoredCalendarEvent[],
  event: CalendarEventData,
): boolean => {
  const cut = effectiveCut(series);
  return cut !== null && atOrAfter(event, instantOf(cut)) && !supersedes(event, cut);
};

export const involvesRange = (
  series: readonly StoredCalendarEvent[],
  event: CalendarEventData,
): boolean =>
  event.thisAndFuture === true || series.some((member) => member.thisAndFuture === true);

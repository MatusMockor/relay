import type { CalendarEventData, StoredCalendarEvent } from '../../model/calendar';
import { compareRevisions } from './revision-order';
import { isRangeRequest } from './series-range-rows';

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

const isCut = (member: StoredCalendarEvent): boolean =>
  member.recurrenceId !== null && member.endsSeries === true;

const instantOf = (member: StoredCalendarEvent): number =>
  recurrenceInstant(member.recurrenceId ?? '');

const lifted = (
  cut: StoredCalendarEvent,
  ranges: readonly StoredCalendarEvent[],
  at: number,
): boolean =>
  ranges.some(
    (range) =>
      instantOf(range) >= instantOf(cut) &&
      instantOf(range) <= at &&
      compareRevisions(range, cut) > 0,
  );

const blockingCuts = (
  series: readonly StoredCalendarEvent[],
  at: number,
): StoredCalendarEvent[] => {
  const master = series.find(isMaster);
  const ranges = series.filter(isRangeRequest);
  return series.filter(
    (member) =>
      isCut(member) &&
      (master === undefined || compareRevisions(member, master) >= 0) &&
      instantOf(member) <= at &&
      !lifted(member, ranges, at),
  );
};

const outranks = (cut: StoredCalendarEvent, event: CalendarEventData): boolean => {
  const order = compareRevisions(event, cut);
  return (
    order < 0 ||
    (order === 0 && event.thisAndFuture === true && event.recurrenceId === cut.recurrenceId)
  );
};

export const cutOffByRange = (
  series: readonly StoredCalendarEvent[],
  event: CalendarEventData,
): boolean => {
  if (event.recurrenceId === null) {
    return false;
  }
  return blockingCuts(series, recurrenceInstant(event.recurrenceId)).some(
    (cut) => cut !== event && outranks(cut, event),
  );
};

export const cutAtSeriesStart = (series: readonly StoredCalendarEvent[]): boolean => {
  const master = series.find(isMaster);
  return master !== undefined && blockingCuts(series, Date.parse(master.startsAt)).length > 0;
};

export const involvesRange = (
  series: readonly StoredCalendarEvent[],
  event: CalendarEventData,
): boolean =>
  event.thisAndFuture === true || series.some((member) => member.thisAndFuture === true);

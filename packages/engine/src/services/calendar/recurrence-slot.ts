import type { CalendarEventData } from '../../model/calendar';

type Slotted = Pick<CalendarEventData, 'recurrenceId' | 'thisAndFuture'>;

export const RANGE_RECORD_SUFFIX = ';RANGE=THISANDFUTURE';

export const isRangeRecord = (event: Slotted): boolean =>
  event.recurrenceId !== null && event.thisAndFuture === true;

export const calendarRecurrenceKey = (event: Slotted): string => {
  if (event.recurrenceId === null) {
    return '';
  }
  return isRangeRecord(event) ? `${event.recurrenceId}${RANGE_RECORD_SUFFIX}` : event.recurrenceId;
};

export const sameSlot = (a: Slotted, b: Slotted): boolean =>
  calendarRecurrenceKey(a) === calendarRecurrenceKey(b);

export const rangeRecordAt = <Row extends Slotted>(
  series: readonly Row[],
  recurrenceId: string,
): Row | undefined =>
  series.find((member) => sameSlot(member, { recurrenceId, thisAndFuture: true }));

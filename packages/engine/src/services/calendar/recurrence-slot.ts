import type { CalendarEventData } from '../../model/calendar';

type Slotted = Pick<CalendarEventData, 'recurrenceId' | 'thisAndFuture' | 'endsSeries'>;

export const RANGE_RECORD_SUFFIX = ';RANGE=THISANDFUTURE';

export const CUT_RECORD_SUFFIX = `${RANGE_RECORD_SUFFIX};CUT`;

export const isRangeRecord = (event: Slotted): boolean =>
  event.recurrenceId !== null && event.thisAndFuture === true;

const suffixOf = (event: Slotted): string => {
  if (!isRangeRecord(event)) {
    return '';
  }
  return event.endsSeries === true ? CUT_RECORD_SUFFIX : RANGE_RECORD_SUFFIX;
};

export const calendarRecurrenceKey = (event: Slotted): string => {
  if (event.recurrenceId === null) {
    return '';
  }
  return `${event.recurrenceId}${suffixOf(event)}`;
};

export const sameSlot = (a: Slotted, b: Slotted): boolean =>
  calendarRecurrenceKey(a) === calendarRecurrenceKey(b);

export const rangeRecordAt = <Row extends Slotted>(
  series: readonly Row[],
  recurrenceId: string,
): Row | undefined =>
  series.find((member) => sameSlot(member, { recurrenceId, thisAndFuture: true }));

export const cutRecordAt = <Row extends Slotted>(
  series: readonly Row[],
  recurrenceId: string,
): Row | undefined =>
  series.find((member) =>
    sameSlot(member, { recurrenceId, thisAndFuture: true, endsSeries: true }),
  );

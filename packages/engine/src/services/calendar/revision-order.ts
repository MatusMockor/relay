import type { CalendarEventData, CalendarRevision } from '../../model/calendar';
import { sameSlot } from './recurrence-slot';

type RevisionedSlot = Pick<
  CalendarEventData,
  'sequence' | 'dtstamp' | 'recurrenceId' | 'thisAndFuture' | 'endsSeries'
>;

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

const bySequence = (a: CalendarRevision, b: CalendarRevision): number =>
  a.sequence - b.sequence || stampOf(a.dtstamp) - stampOf(b.dtstamp);

const byStamp = (a: CalendarRevision, b: CalendarRevision): number =>
  stampOf(a.dtstamp) - stampOf(b.dtstamp) || a.sequence - b.sequence;

export const compareRevisions = (a: RevisionedSlot, b: RevisionedSlot): number =>
  sameSlot(a, b) ? bySequence(a, b) : byStamp(a, b);

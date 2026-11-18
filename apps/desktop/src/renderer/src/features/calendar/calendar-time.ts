import type { CalendarOccurrence, CalendarWindowQuery } from '@relay/shared';
import { hm } from '../../lib/dates';

export const systemTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const startOfDay = (base: Date, offset: number): Date =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);

export const windowOf = (from: Date, to: Date): CalendarWindowQuery => ({
  from: from.toISOString(),
  to: to.toISOString(),
  timeZone: systemTimeZone(),
});

export const weekWindow = (base: Date): CalendarWindowQuery =>
  windowOf(startOfDay(base, 0), startOfDay(base, 7));

export const onDay = (occurrence: CalendarOccurrence, base: Date, offset: number): boolean => {
  const from = startOfDay(base, offset).getTime();
  const to = startOfDay(base, offset + 1).getTime();
  const start = Date.parse(occurrence.start);
  const end = Date.parse(occurrence.end);
  if (start === end) {
    return start >= from && start < to;
  }
  return start < to && end > from;
};

export const startsBefore = (occurrence: CalendarOccurrence, base: Date, offset: number): boolean =>
  Date.parse(occurrence.start) < startOfDay(base, offset).getTime();

export const startLabel = (occurrence: CalendarOccurrence, base: Date, offset: number): string => {
  if (occurrence.allDay) {
    return 'deň';
  }
  return startsBefore(occurrence, base, offset) ? '…' : hm(new Date(occurrence.start));
};

export const untilLabel = (occurrence: Pick<CalendarOccurrence, 'end' | 'allDay'>) =>
  occurrence.allDay ? 'Celý deň' : `do ${hm(new Date(occurrence.end))}`;

export const spanLabel = (occurrence: Pick<CalendarOccurrence, 'start' | 'end' | 'allDay'>) => {
  if (occurrence.allDay) {
    return 'Celý deň';
  }
  return `${hm(new Date(occurrence.start))}-${hm(new Date(occurrence.end))}`;
};

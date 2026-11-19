import { capitalize } from './text';
import { MONTHS, WEEKDAYS, dayDiff, dm, hm, listTimeLabel, startOfWeek } from './dates';

export interface DayGroup {
  readonly label: string;
  readonly date: string | null;
}

const weekdayOf = (date: Date): string => WEEKDAYS[date.getDay()] ?? '';

const monthGroup = (date: Date, now: Date): DayGroup => {
  const month = MONTHS[date.getMonth()] ?? '';
  if (date.getFullYear() === now.getFullYear()) {
    return { label: month, date: null };
  }
  return { label: `${month} ${String(date.getFullYear())}`, date: null };
};

export const dayGroupOf = (iso: string, now: Date): DayGroup => {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff >= 0) {
    return { label: 'Dnes', date: `${weekdayOf(now)} ${dm(now)}` };
  }
  if (diff === -1) {
    return { label: 'Včera', date: `${weekdayOf(date)} ${dm(date)}` };
  }
  if (date.getTime() >= startOfWeek(now)) {
    return { label: capitalize(weekdayOf(date)), date: dm(date) };
  }
  if (date.getTime() >= startOfWeek(now, 1)) {
    return { label: 'Minulý týždeň', date: null };
  }
  return monthGroup(date, now);
};

export const dayGroupName = (group: DayGroup): string =>
  group.date === null ? group.label : `${group.label}, ${group.date}`;

export const sameDayGroup = (left: DayGroup, right: DayGroup): boolean =>
  left.label === right.label && left.date === right.date;

export const threadTimeLabel = (iso: string, now: Date): string => {
  if (dayDiff(new Date(iso), now) > 0 || dayGroupOf(iso, now).date === null) {
    return listTimeLabel(iso, now);
  }
  return hm(new Date(iso));
};

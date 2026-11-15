import { capitalize } from './text';

export const WEEKDAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
export const WEEKDAYS_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
export const WEEKDAYS_IN = [
  'v nedeľu',
  'v pondelok',
  'v utorok',
  'v stredu',
  'vo štvrtok',
  'v piatok',
  'v sobotu',
];
const MONTHS = [
  'Január',
  'Február',
  'Marec',
  'Apríl',
  'Máj',
  'Jún',
  'Júl',
  'August',
  'September',
  'Október',
  'November',
  'December',
];

export const hm = (date: Date): string =>
  `${String(date.getHours())}:${String(date.getMinutes()).padStart(2, '0')}`;
export const dm = (date: Date): string =>
  `${String(date.getDate())}. ${String(date.getMonth() + 1)}.`;

const startOfDay = (date: Date): number => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

export const dayDiff = (date: Date, now: Date): number =>
  Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);

export const listTimeLabel = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff === 0) {
    return hm(date);
  }
  if (diff === -1) {
    return 'včera';
  }
  if (diff > -7 && diff < 0) {
    return WEEKDAYS_SHORT[date.getDay()] ?? dm(date);
  }
  return dm(date);
};

export const messageTimeLabel = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff === 0) {
    return `dnes ${hm(date)}`;
  }
  if (diff === -1) {
    return `včera ${hm(date)}`;
  }
  if (diff > -7 && diff < 0) {
    return `${WEEKDAYS_SHORT[date.getDay()] ?? ''} ${hm(date)}`;
  }
  return `${dm(date)} ${hm(date)}`;
};

const startOfWeek = (now: Date, weeksBack = 0): number => {
  const copy = new Date(startOfDay(now));
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset - weeksBack * 7);
  return copy.getTime();
};

export const dayGroupOf = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff >= 0) {
    return 'Dnes';
  }
  if (diff === -1) {
    return 'Včera';
  }
  const week = startOfWeek(now);
  if (date.getTime() >= week) {
    return 'Tento týždeň';
  }
  if (date.getTime() >= startOfWeek(now, 1)) {
    return 'Minulý týždeň';
  }
  const month = MONTHS[date.getMonth()] ?? '';
  return date.getFullYear() === now.getFullYear()
    ? month
    : `${month} ${String(date.getFullYear())}`;
};

export interface WhenDescription {
  readonly group: string;
  readonly short: string;
  readonly wh: string;
  readonly phrase: string;
}

export const describeWhen = (date: Date, now: Date): WhenDescription => {
  const diff = dayDiff(date, now);
  const time = hm(date);
  const weekday = date.getDay();
  if (diff <= 0) {
    return { group: 'Dnes', short: `dnes ${time}`, wh: time, phrase: `dnes o ${time}` };
  }
  if (diff === 1) {
    return {
      group: 'Zajtra',
      short: `zajtra ${time}`,
      wh: `${WEEKDAYS_SHORT[weekday] ?? ''} ${time}`,
      phrase: `zajtra o ${time}`,
    };
  }
  if (diff < 7) {
    return {
      group: capitalize(WEEKDAYS[weekday] ?? ''),
      short: `${WEEKDAYS_SHORT[weekday] ?? ''} ${time}`,
      wh: `${WEEKDAYS_SHORT[weekday] ?? ''} ${time}`,
      phrase: `${WEEKDAYS_IN[weekday] ?? ''} o ${time}`,
    };
  }
  return {
    group: 'Neskôr',
    short: dm(date),
    wh: `${WEEKDAYS_SHORT[weekday] ?? ''} ${dm(date)}`,
    phrase: `${WEEKDAYS_IN[weekday] ?? ''} ${dm(date)} o ${time}`,
  };
};

export const atDay = (now: Date, days: number, hours: number, minutes = 0): Date => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

import { atDay } from '../../lib/dates';

export interface WhenPreset {
  readonly label: string;
  readonly date: Date;
}

const daysToMonday = (now: Date): number => (8 - now.getDay()) % 7 || 7;

export const remindPresets = (now: Date): WhenPreset[] => [
  ...(now.getHours() < 21
    ? [{ label: 'Neskôr dnes', date: atDay(now, 0, Math.max(18, now.getHours() + 3)) }]
    : []),
  { label: 'Zajtra ráno', date: atDay(now, 1, 8) },
  { label: 'Pondelok ráno', date: atDay(now, daysToMonday(now), 8) },
  { label: 'Budúci týždeň', date: atDay(now, 7, 8) },
];

export const schedulePresets = (now: Date): WhenPreset[] => [
  ...(now.getHours() < 13 ? [{ label: 'Dnes poobede', date: atDay(now, 0, 14) }] : []),
  { label: 'Zajtra ráno', date: atDay(now, 1, 8) },
  { label: 'Pondelok ráno', date: atDay(now, daysToMonday(now), 8) },
];

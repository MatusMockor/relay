import type { DemoAt } from './types';

export const atTime = (now: Date, [days, hours, minutes]: DemoAt): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

export const atPast = (now: Date, at: DemoAt, order: number): string => {
  const iso = atTime(now, at);
  const latest = now.getTime() - (order + 1) * 60_000;
  return Date.parse(iso) > latest ? new Date(latest).toISOString() : iso;
};

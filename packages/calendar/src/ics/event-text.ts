import {
  type CalendarEventStatus,
  type CalendarMethod,
  CalendarMethodSchema,
} from '@relay/shared/domain';
import type ICAL from 'ical.js';

type Component = InstanceType<typeof ICAL.Component>;

export const textOf = (component: Component, name: string, max: number): string | null => {
  const value: unknown = component.getFirstPropertyValue(name);
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
};

export const methodOf = (calendar: Component): CalendarMethod | null => {
  const parsed = CalendarMethodSchema.safeParse(textOf(calendar, 'method', 20)?.toUpperCase());
  return parsed.success ? parsed.data : null;
};

export const statusOf = (vevent: Component, method: CalendarMethod | null): CalendarEventStatus => {
  const status = textOf(vevent, 'status', 20)?.toUpperCase();
  if (method === 'CANCEL' || status === 'CANCELLED') {
    return 'cancelled';
  }
  return status === 'TENTATIVE' ? 'tentative' : 'confirmed';
};

export const sequenceOf = (vevent: Component): number => {
  const value: unknown = vevent.getFirstPropertyValue('sequence');
  const sequence = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(sequence) && sequence >= 0 ? Math.min(sequence, 1_000_000) : 0;
};

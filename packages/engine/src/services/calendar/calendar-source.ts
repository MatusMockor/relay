import type { CalendarSourceKind } from '@relay/shared/domain';
import type { CalendarSource, StoredCalendarEvent } from '../../model/calendar';

export const sourceKey = (source: CalendarSource): string => {
  if (source.kind === 'invite') {
    return source.accountId;
  }
  if (source.kind === 'subscription') {
    return source.subscriptionId;
  }
  return source.calendarId;
};

export const sourceRef = (
  source: CalendarSource,
): { readonly sourceKind: CalendarSourceKind; readonly sourceId: string } => ({
  sourceKind: source.kind,
  sourceId: sourceKey(source),
});

export const seriesKey = (event: StoredCalendarEvent): string =>
  `${event.source.kind}:${sourceKey(event.source)}:${event.uid}`;

export const sameRecurrence = (a: string | null, b: string | null): boolean => a === b;

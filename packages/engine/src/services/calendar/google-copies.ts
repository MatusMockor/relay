import type { ThreadId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';

export const identityKey = (event: Pick<StoredCalendarEvent, 'uid' | 'myEmail'>): string | null =>
  event.myEmail === null ? null : `${event.uid}\u0000${event.myEmail.toLowerCase()}`;

const keysOf = (events: readonly StoredCalendarEvent[]): Set<string> =>
  new Set(events.flatMap((event) => identityKey(event) ?? []));

export const preferGoogleCopies = (
  events: readonly StoredCalendarEvent[],
): StoredCalendarEvent[] => {
  const google = keysOf(events.filter((event) => event.source.kind === 'google'));
  if (google.size === 0) {
    return [...events];
  }
  const threads = new Map<string, ThreadId>();
  for (const event of events) {
    const key = identityKey(event);
    if (event.source.kind === 'invite' && event.threadId !== null && key !== null) {
      threads.set(key, event.threadId);
    }
  }
  return events
    .filter((event) => event.source.kind !== 'invite' || !google.has(identityKey(event) ?? ''))
    .map((event) => {
      const thread = threads.get(identityKey(event) ?? '');
      return event.source.kind === 'google' && event.threadId === null && thread !== undefined
        ? { ...event, threadId: thread }
        : event;
    });
};

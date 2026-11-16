import type { CalendarWindowQuery, ThreadId } from '@relay/shared';

export const calendarKeys = {
  all: () => ['mail', 'calendar'] as const,
  occurrences: (window: CalendarWindowQuery) =>
    ['mail', 'calendar', 'occurrences', window] as const,
  invitations: (threadId: ThreadId, timeZone: string) =>
    ['mail', 'calendar', 'invitations', threadId, timeZone] as const,
  subscriptions: () => ['mail', 'calendar', 'subscriptions'] as const,
  failedInvitations: () => ['mail', 'calendar', 'failed-invitations'] as const,
  google: () => ['mail', 'calendar', 'google'] as const,
};

import type {
  CalendarEventId,
  CalendarRsvpResponse,
  CalendarWindowQuery,
  ThreadId,
} from '@relay/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarKeys } from './calendar-keys';
import { useClient } from './services-context';

export const useOccurrences = (window: CalendarWindowQuery) => {
  const client = useClient();
  return useQuery({
    queryKey: calendarKeys.occurrences(window),
    queryFn: () => client.listOccurrences(window),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
};

export const useInvitations = (threadId: ThreadId, timeZone: string) => {
  const client = useClient();
  return useQuery({
    queryKey: calendarKeys.invitations(threadId, timeZone),
    queryFn: () => client.listInvitations(threadId, timeZone),
  });
};

export const useCalendarSubscriptions = () => {
  const client = useClient();
  return useQuery({
    queryKey: calendarKeys.subscriptions(),
    queryFn: () => client.listCalendarSubscriptions(),
  });
};

export const useRefreshCalendar = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: calendarKeys.all() });
};

export const useRsvp = () => {
  const client = useClient();
  const refresh = useRefreshCalendar();
  return async (eventId: CalendarEventId, response: CalendarRsvpResponse, timeZone: string) => {
    const invitation = await client.respondToInvitation(eventId, response, timeZone);
    await refresh();
    return invitation;
  };
};

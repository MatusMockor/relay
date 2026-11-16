import { useQuery } from '@tanstack/react-query';
import { calendarKeys } from './calendar-keys';
import { useClient } from './services-context';

export const useGoogleCalendarOverview = () => {
  const client = useClient();
  return useQuery({
    queryKey: calendarKeys.google(),
    queryFn: () => client.googleCalendarOverview(),
  });
};

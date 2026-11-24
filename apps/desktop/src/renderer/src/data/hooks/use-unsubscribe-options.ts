import type { ThreadId } from '@relay/shared';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useUnsubscribeOptions = (threadId: ThreadId) => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.unsubscribe(threadId),
    queryFn: () => client.getUnsubscribeOptions(threadId),
  });
};

import type { AutomationId } from '@relay/shared';
import { skipToken, useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useAutomationHistory = (automationId: AutomationId | null) => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.automationHistory(automationId),
    queryFn: automationId === null ? skipToken : () => client.automationHistory(automationId),
    staleTime: 10_000,
    retry: false,
  });
};

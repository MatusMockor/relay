import type { AutomationId } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useApplyAutomation = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: AutomationId) => client.applyAutomation(automationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allMailboxes() }),
      ]);
    },
  });
};

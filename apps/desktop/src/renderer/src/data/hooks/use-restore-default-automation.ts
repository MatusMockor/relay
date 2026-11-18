import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useRestoreDefaultAutomation = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.restoreDefaultAutomation(),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automations(), saved);
    },
  });
};

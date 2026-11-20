import type { AutomationActivityId, AutomationId } from '@relay/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

const refreshAfterUndo = (queryClient: QueryClient, automationId: AutomationId) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allMailboxes() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.automationHistory(automationId) }),
  ]);

export const useUndoAutomationActivity = (automationId: AutomationId) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (activityId: AutomationActivityId) =>
      client.undoAutomationActivity(automationId, activityId),
    onSettled: () => refreshAfterUndo(queryClient, automationId),
  });
};

export const useUndoAutomationSince = (automationId: AutomationId) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (since: string) => client.undoAutomationSince(automationId, since),
    onSettled: () => refreshAfterUndo(queryClient, automationId),
  });
};

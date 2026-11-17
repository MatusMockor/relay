import type { Automation, AutomationInput } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const toAutomationInput = (automation: Automation): AutomationInput => ({
  id: automation.id,
  accountId: automation.accountId,
  name: automation.name,
  enabled: automation.enabled,
  order: automation.order,
  conditions: automation.conditions,
  ai: automation.ai,
  actions: automation.actions,
});

export const useReplaceAutomations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automations: AutomationInput[]) =>
      client.replaceAutomations(automations.map((automation, order) => ({ ...automation, order }))),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automations(), saved);
    },
  });
};

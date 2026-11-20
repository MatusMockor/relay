import {
  type Automation,
  type AutomationEntry,
  type AutomationInput,
  type AutomationReplaceItem,
  isUnsupportedAutomation,
} from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const toAutomationInput = (automation: Automation): AutomationInput => ({
  id: automation.id,
  accountId: automation.accountId,
  name: automation.name,
  enabled: automation.enabled,
  order: automation.order,
  match: automation.match,
  conditions: automation.conditions,
  exceptions: automation.exceptions,
  ai: automation.ai,
  actions: automation.actions,
});

export const keptUnsupported = (
  entries: readonly AutomationEntry[] | undefined,
): AutomationReplaceItem[] =>
  (entries ?? []).filter(isUnsupportedAutomation).map((entry) => ({ id: entry.id, keep: true }));

export const useReplaceAutomations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automations: AutomationInput[]) =>
      client.replaceAutomations([
        ...automations.map((automation, order) => ({ ...automation, order })),
        ...keptUnsupported(queryClient.getQueryData<AutomationEntry[]>(queryKeys.automations())),
      ]),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automations(), saved);
    },
  });
};

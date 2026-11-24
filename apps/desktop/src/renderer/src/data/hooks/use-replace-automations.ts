import {
  type Automation,
  type AutomationEntry,
  type AutomationInput,
  type AutomationReplaceItem,
  isKeepAutomationInput,
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

export const withKeptUnsupported = (
  inputs: readonly AutomationInput[],
  entries: readonly AutomationEntry[] | undefined,
): AutomationReplaceItem[] => {
  const items: AutomationReplaceItem[] = [...inputs];
  (entries ?? []).forEach((entry, index) => {
    if (!isUnsupportedAutomation(entry)) {
      return;
    }
    items.splice(Math.min(index, items.length), 0, { id: entry.id, keep: true });
  });
  return items.map((item, order) => (isKeepAutomationInput(item) ? item : { ...item, order }));
};

export const useReplaceAutomations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automations: AutomationInput[]) =>
      client.replaceAutomations(
        withKeptUnsupported(
          automations,
          queryClient.getQueryData<AutomationEntry[]>(queryKeys.automations()),
        ),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automations(), saved);
    },
  });
};

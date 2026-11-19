import type { Automation, AutomationInput } from '@relay/shared';
import { describeError } from '../../../data/errors';
import { useReplaceAutomations } from '../../../data/hooks/use-replace-automations';
import { showToast } from '../../../state/toast-store';

export interface PersistAutomations {
  readonly saving: boolean;
  readonly persist: (
    inputs: AutomationInput[],
    onSaved: (stored: readonly Automation[]) => void,
  ) => void;
}

export const usePersistAutomations = (): PersistAutomations => {
  const replace = useReplaceAutomations();
  return {
    saving: replace.isPending,
    persist: (inputs, onSaved) => {
      replace.mutate(inputs, {
        onSuccess: onSaved,
        onError: (error) => {
          showToast(describeError(error));
        },
      });
    },
  };
};

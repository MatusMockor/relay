import { type Automation, type AutomationInput, supportedAutomations } from '@relay/shared';
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
      void replace.mutateAsync(inputs).then(
        (stored) => {
          onSaved(supportedAutomations(stored));
        },
        (error: unknown) => {
          showToast(describeError(error));
        },
      );
    },
  };
};

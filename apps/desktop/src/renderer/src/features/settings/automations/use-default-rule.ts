import { describeError } from '../../../data/errors';
import { useAutomations } from '../../../data/hooks/use-mail-queries';
import { useRestoreDefaultAutomation } from '../../../data/hooks/use-restore-default-automation';
import { showToast } from '../../../state/toast-store';

export interface DefaultRule {
  readonly removed: boolean;
  readonly restoring: boolean;
  restore(): void;
}

export const useDefaultRule = (): DefaultRule => {
  const automations = useAutomations();
  const restoreDefault = useRestoreDefaultAutomation();
  const loaded = automations.data;
  return {
    removed: loaded !== undefined && !loaded.some((rule) => rule.preset === 'jiraTasks'),
    restoring: restoreDefault.isPending,
    restore: () => {
      restoreDefault.mutate(undefined, {
        onError: (error) => {
          showToast(describeError(error));
        },
      });
    },
  };
};

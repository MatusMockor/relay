import {
  type AutomationAction,
  type AutomationId,
  MAIL_AUTOMATION_ACTION_TYPES,
} from '@relay/shared';
import { Button } from '@relay/ui';
import { describeError } from '../../../data/errors';
import { useApplyAutomation } from '../../../data/hooks/use-apply-automation';
import { showToast } from '../../../state/toast-store';
import { applyResultMessage } from './apply-result';

export interface ApplyToExistingProps {
  readonly automationId: AutomationId;
  readonly name: string;
  readonly actions: readonly AutomationAction[];
  readonly disabled: boolean;
}

export function ApplyToExisting({ automationId, name, actions, disabled }: ApplyToExistingProps) {
  const apply = useApplyAutomation();
  if (!actions.some((action) => MAIL_AUTOMATION_ACTION_TYPES.includes(action.type))) {
    return null;
  }
  return (
    <Button
      className="au-apply"
      aria-label={`Použiť pravidlo ${name} aj na existujúce maily`}
      title="Použije poštové akcie na najviac 500 konverzácií v doručenej pošte"
      disabled={disabled || apply.isPending}
      onClick={() => {
        apply.mutate(automationId, {
          onSuccess: (result) => {
            showToast(applyResultMessage(result));
          },
          onError: (error) => {
            showToast(describeError(error));
          },
        });
      }}
    >
      {apply.isPending ? 'Používam…' : 'Použiť aj na existujúce'}
    </Button>
  );
}

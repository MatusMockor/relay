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

const BLOCKED = 'Najprv dokonči rozpísané podmienky.';

export interface ApplyToExistingProps {
  readonly automationId: AutomationId;
  readonly actions: readonly AutomationAction[];
  readonly disabled: boolean;
  readonly blocked: boolean;
}

export function ApplyToExisting({
  automationId,
  actions,
  disabled,
  blocked,
}: ApplyToExistingProps) {
  const apply = useApplyAutomation();
  if (!actions.some((action) => MAIL_AUTOMATION_ACTION_TYPES.includes(action.type))) {
    return null;
  }
  return (
    <>
      <Button
        title={
          blocked ? BLOCKED : 'Použije poštové akcie na najviac 500 konverzácií v doručenej pošte'
        }
        disabled={disabled || blocked || apply.isPending}
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
        {apply.isPending ? 'Používam…' : 'Použiť na maily, ktoré už mám'}
      </Button>
      {blocked ? <span className="au-note">{BLOCKED}</span> : null}
    </>
  );
}

import type { AutomationAction, AutomationActionOf } from '@relay/shared';
import { Icon } from '@relay/ui';
import { withoutAction } from './action-choices';
import { FORWARD_IDLE_LABEL } from './action-params';
import { CheckRow } from './CheckRow';

export interface ForwardRowProps {
  readonly actions: readonly AutomationAction[];
  readonly disabled: boolean;
  readonly onApply: (next: AutomationAction[] | null) => void;
  readonly onPick: (
    current: AutomationAction | null,
  ) => (event: { readonly currentTarget: Element }) => void;
}

const isForward = (action: AutomationAction): action is AutomationActionOf<'forward'> =>
  action.type === 'forward';

export function ForwardRow({ actions, disabled, onApply, onPick }: ForwardRowProps) {
  const forward = actions.find(isForward) ?? null;
  return (
    <CheckRow
      label={FORWARD_IDLE_LABEL}
      checked={forward !== null}
      disabled={disabled}
      onToggle={(event) => {
        if (forward === null) {
          onPick(null)(event);
          return;
        }
        onApply(withoutAction(actions, forward));
      }}
    >
      {forward === null ? null : (
        <button
          type="button"
          className="au-target"
          aria-label={`Zmeniť adresu: ${forward.to}`}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={onPick(forward)}
        >
          {forward.to}
          <Icon name="down" size={12} />
        </button>
      )}
    </CheckRow>
  );
}

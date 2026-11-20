import type { AutomationAction } from '@relay/shared';
import { withoutAction } from './action-choices';
import { actionKey, type ActionTargets, describeAction } from './action-targets';
import { CheckRow } from './CheckRow';

export interface LabelActionRowsProps {
  readonly actions: readonly AutomationAction[];
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onApply: (next: AutomationAction[] | null) => void;
  readonly onAdd: (event: { readonly currentTarget: Element }) => void;
}

export function LabelActionRows({
  actions,
  targets,
  disabled,
  onApply,
  onAdd,
}: LabelActionRowsProps) {
  return (
    <>
      {actions.map((action) => {
        if (action.type !== 'addLabel') {
          return null;
        }
        const view = describeAction(action, targets);
        return (
          <CheckRow
            key={actionKey(action)}
            label={view.label}
            broken={view.broken}
            checked
            disabled={disabled}
            onToggle={() => {
              onApply(withoutAction(actions, action));
            }}
          />
        );
      })}
      <CheckRow label="Pridať štítok" checked={false} disabled={disabled} onToggle={onAdd} />
    </>
  );
}

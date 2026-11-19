import type { AccountId, AutomationAction, AutomationActionOf, MailAccount } from '@relay/shared';
import { useState } from 'react';
import {
  conflictOf,
  pickedTarget,
  replaceAction,
  toggleSimple,
  withoutAction,
} from './action-choices';
import { actionKey, type ActionTargets, describeAction, moveChoiceLabel } from './action-targets';
import { ActionTargetPopover, type TargetPicking } from './ActionTargetPopover';
import type { TargetKind } from './ActionTargetMenu';
import { AI_ACTIONS, ACTION_LABELS, SIMPLE_ACTIONS } from './automation-labels';
import { CheckRow } from './CheckRow';
import type { RuleChange } from './editable-rule';
import { MoveTarget } from './MoveTarget';

export interface ActionChecklistProps {
  readonly actions: readonly AutomationAction[];
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
}

const isMove = (action: AutomationAction): action is AutomationActionOf<'moveTo'> =>
  action.type === 'moveTo';

export function ActionChecklist({
  actions,
  accountId,
  accounts,
  targets,
  disabled,
  onChange,
}: ActionChecklistProps) {
  const [picking, setPicking] = useState<TargetPicking | null>(null);
  const move = actions.find(isMove) ?? null;
  const moveLabel = moveChoiceLabel(targets.gmail);
  const apply = (next: AutomationAction[] | null) => {
    if (next !== null) {
      onChange({ actions: next });
    }
  };
  const pick =
    (kind: TargetKind, current: AutomationAction | null) =>
    (event: { readonly currentTarget: Element }) => {
      setPicking({ kind, current, anchor: event.currentTarget.getBoundingClientRect() });
    };
  return (
    <section className="au-sec" aria-labelledby="au-what">
      <h3 id="au-what">Čo spraviť</h3>
      <div className="au-acts">
        {SIMPLE_ACTIONS.map((type) => {
          const checked = actions.some((action) => action.type === type);
          return (
            <CheckRow
              key={type}
              label={ACTION_LABELS[type]}
              ai={AI_ACTIONS.includes(type)}
              checked={checked}
              note={!checked && conflictOf(actions, type) !== null ? 'Nahradí presun' : null}
              disabled={disabled}
              onToggle={() => {
                apply(toggleSimple(actions, type));
              }}
            />
          );
        })}
        <CheckRow
          label={moveLabel}
          checked={move !== null}
          broken={move !== null && describeAction(move, targets).broken}
          note={
            move === null && conflictOf(actions, 'moveTo') !== null ? 'Nahradí archiváciu' : null
          }
          disabled={disabled}
          onToggle={(event) => {
            if (move === null) {
              pick('moveTo', null)(event);
              return;
            }
            apply(withoutAction(actions, move));
          }}
        >
          {move === null ? null : (
            <MoveTarget
              mailboxId={move.mailboxId}
              targets={targets}
              disabled={disabled}
              onOpen={pick('moveTo', move)}
            />
          )}
        </CheckRow>
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
                apply(withoutAction(actions, action));
              }}
            />
          );
        })}
        <CheckRow
          label="Pridať štítok"
          checked={false}
          disabled={disabled}
          onToggle={pick('addLabel', null)}
        />
      </div>
      {picking === null ? null : (
        <ActionTargetPopover
          picking={picking}
          title={picking.kind === 'moveTo' ? moveLabel : 'Pridať štítok'}
          actions={actions}
          accountId={accountId}
          accounts={accounts}
          onClose={() => {
            setPicking(null);
          }}
          onPick={(action, picked) => {
            setPicking(null);
            onChange(
              pickedTarget(
                replaceAction(actions, picking.current ?? conflictOf(actions, 'moveTo'), action),
                picked,
                accountId,
              ),
            );
          }}
        />
      )}
    </section>
  );
}

import type { AccountId, AutomationAction, AutomationActionOf, MailAccount } from '@relay/shared';
import { useState } from 'react';
import {
  conflictOf,
  pickedTarget,
  replaceAction,
  replaceNoteOf,
  toggleSimple,
  withoutAction,
} from './action-choices';
import { FORWARD_IDLE_LABEL } from './action-params';
import { type ActionTargets, describeAction, moveChoiceLabel } from './action-targets';
import { ActionTargetPopover, type TargetPicking } from './ActionTargetPopover';
import type { TargetKind } from './ActionTargetMenu';
import { AI_ACTIONS, ACTION_LABELS, SIMPLE_ACTIONS } from './automation-labels';
import { CheckRow } from './CheckRow';
import type { RuleChange } from './editable-rule';
import { ForwardRow } from './ForwardRow';
import { LabelActionRows } from './LabelActionRows';
import { MoveTarget } from './MoveTarget';
import { RemindRow } from './RemindRow';

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

const popoverTitle = (kind: TargetKind, moveLabel: string): string => {
  if (kind === 'moveTo') {
    return moveLabel;
  }
  return kind === 'forward' ? FORWARD_IDLE_LABEL : 'Pridať štítok';
};

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
      <h3 id="au-what">Potom</h3>
      <div className="au-acts">
        {SIMPLE_ACTIONS.map((type) => (
          <CheckRow
            key={type}
            label={ACTION_LABELS[type]}
            ai={AI_ACTIONS.includes(type)}
            checked={actions.some((action) => action.type === type)}
            note={replaceNoteOf(actions, type)}
            disabled={disabled}
            onToggle={() => {
              apply(toggleSimple(actions, type));
            }}
          />
        ))}
        <RemindRow actions={actions} disabled={disabled} onApply={apply} />
        <CheckRow
          label={moveLabel}
          checked={move !== null}
          broken={move !== null && describeAction(move, targets).broken}
          note={move === null ? replaceNoteOf(actions, 'moveTo') : null}
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
        <LabelActionRows
          actions={actions}
          targets={targets}
          disabled={disabled}
          onApply={apply}
          onAdd={pick('addLabel', null)}
        />
        <ForwardRow
          actions={actions}
          disabled={disabled}
          onApply={apply}
          onPick={(current) => pick('forward', current)}
        />
      </div>
      {picking === null ? null : (
        <ActionTargetPopover
          picking={picking}
          title={popoverTitle(picking.kind, moveLabel)}
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
                replaceAction(
                  actions,
                  picking.current ?? conflictOf(actions, picking.kind),
                  action,
                ),
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

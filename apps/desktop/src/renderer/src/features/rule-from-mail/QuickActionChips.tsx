import type { AccountId, AutomationAction, MailAccount } from '@relay/shared';
import { useState } from 'react';
import { replaceNoteOf } from '../settings/automations/action-choices';
import { DEFAULT_REMIND_DAYS, remindLabel } from '../settings/automations/action-params';
import {
  type ActionTargets,
  describeAction,
  moveChoiceLabel,
} from '../settings/automations/action-targets';
import {
  ActionTargetPopover,
  type TargetPicking,
} from '../settings/automations/ActionTargetPopover';
import type { TargetKind } from '../settings/automations/ActionTargetMenu';
import { ACTION_LABELS } from '../settings/automations/automation-labels';
import { ActionChip } from './ActionChip';
import {
  type QuickSimpleAction,
  toggleQuick,
  toggleRemind,
  withoutType,
  withTarget,
} from './quick-actions';

export interface QuickActionChipsProps {
  readonly actions: readonly AutomationAction[];
  readonly accountId: AccountId;
  readonly accounts: readonly MailAccount[];
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onChange: (actions: readonly AutomationAction[]) => void;
}

const LEADING: readonly QuickSimpleAction[] = ['markRead', 'archive', 'pin'];

export function QuickActionChips({
  actions,
  accountId,
  accounts,
  targets,
  disabled,
  onChange,
}: QuickActionChipsProps) {
  const [picking, setPicking] = useState<TargetPicking | null>(null);
  const remind = actions.find((action) => action.type === 'remind');
  const note = (type: AutomationAction['type']): string | undefined =>
    replaceNoteOf(actions, type) ?? undefined;
  const simple = (type: QuickSimpleAction) => (
    <ActionChip
      key={type}
      label={ACTION_LABELS[type]}
      on={actions.some((action) => action.type === type)}
      note={note(type)}
      disabled={disabled}
      onClick={() => {
        onChange(toggleQuick(actions, type));
      }}
    />
  );
  const target = (kind: TargetKind, idle: string) => {
    const current = actions.find((action) => action.type === kind);
    return (
      <ActionChip
        key={kind}
        label={current === undefined ? idle : describeAction(current, targets).label}
        on={current !== undefined}
        note={current === undefined ? note(kind) : undefined}
        disabled={disabled}
        onClick={(event) => {
          if (current !== undefined) {
            onChange(withoutType(actions, kind));
            return;
          }
          setPicking({ kind, current: null, anchor: event.currentTarget.getBoundingClientRect() });
        }}
      />
    );
  };
  return (
    <div className="rfm-chips" role="group" aria-label="Akcie pravidla">
      {LEADING.map(simple)}
      {target('addLabel', 'Pridať štítok')}
      {target('moveTo', moveChoiceLabel(targets.gmail))}
      <ActionChip
        label={remindLabel(remind?.afterDays ?? DEFAULT_REMIND_DAYS)}
        on={remind !== undefined}
        note={remind === undefined ? note('remind') : undefined}
        disabled={disabled}
        onClick={() => {
          onChange(toggleRemind(actions));
        }}
      />
      {simple('notify')}
      {picking === null ? null : (
        <ActionTargetPopover
          picking={picking}
          title={picking.kind === 'moveTo' ? moveChoiceLabel(targets.gmail) : 'Pridať štítok'}
          actions={actions}
          accountId={accountId}
          accounts={accounts}
          onClose={() => {
            setPicking(null);
          }}
          onPick={(action) => {
            setPicking(null);
            onChange(withTarget(actions, action));
          }}
        />
      )}
    </div>
  );
}

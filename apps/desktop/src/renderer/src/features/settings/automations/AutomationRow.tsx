import type { MailAccount } from '@relay/shared';
import { cx, Icon, Switch } from '@relay/ui';
import { useEffect, useRef } from 'react';
import { describeAction } from './action-targets';
import type { EditableRule } from './editable-rule';
import { summarizeActions, summarizeConditions } from './rule-summary';
import { useActionTargets } from './use-action-targets';
import type { DragHandleProps, DropTargetProps } from './use-row-drag';

export interface AutomationRowProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly index: number;
  readonly disabled: boolean;
  readonly place: 'above' | 'below' | null;
  readonly focusHandle: boolean;
  readonly handle: DragHandleProps;
  readonly target: DropTargetProps;
  readonly onOpen: () => void;
  readonly onToggle: (enabled: boolean) => void;
}

export function AutomationRow({
  rule,
  accounts,
  index,
  disabled,
  place,
  focusHandle,
  handle,
  target,
  onOpen,
  onToggle,
}: AutomationRowProps) {
  const { input } = rule;
  const grip = useRef<HTMLButtonElement>(null);
  const targets = useActionTargets(input.accountId, accounts);
  const broken = input.actions.some((action) => describeAction(action, targets).broken);
  const account = accounts.find((item) => item.id === input.accountId);
  const conditions = summarizeConditions(input.conditions);
  useEffect(() => {
    if (focusHandle) {
      grip.current?.focus();
    }
  }, [focusHandle, index]);
  return (
    <li
      className={cx('au-row', !input.enabled && 'off', place !== null && `drop-${place}`)}
      aria-label={`Pravidlo ${input.name}`}
      {...target}
    >
      {rule.saved ? (
        <button
          ref={grip}
          type="button"
          className="au-grip"
          aria-label={`Presunúť pravidlo ${input.name}`}
          title="Potiahni alebo použi Alt a šípky"
          {...handle}
        />
      ) : (
        <span className="au-grip" aria-hidden="true" />
      )}
      <button
        type="button"
        className="au-open"
        aria-label={`Otvoriť pravidlo ${input.name}`}
        onClick={onOpen}
      >
        <span className="au-name">
          <b>{input.name}</b>
          {rule.preset === null ? null : <span className="scope">Predvolené</span>}
          {rule.saved ? null : <span className="scope warn">Neuložené</span>}
          {broken ? <span className="scope bad">Cieľ neexistuje</span> : null}
        </span>
        <span className="au-sum">
          {`${conditions === '' ? 'Bez podmienky' : conditions} → ${summarizeActions(input.actions, targets)}`}
        </span>
      </button>
      <span className="chip au-acc">{account?.displayName ?? 'Všetky účty'}</span>
      <Switch
        checked={input.enabled}
        label={`Pravidlo ${input.name} zapnuté`}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="au-chev" aria-hidden="true">
        <Icon name="forward" size={14} />
      </span>
    </li>
  );
}

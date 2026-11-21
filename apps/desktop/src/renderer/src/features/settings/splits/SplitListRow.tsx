import { type MailAccount, type Split, splitCriteria } from '@relay/shared';
import { cx, Icon } from '@relay/ui';
import { useEffect, useRef } from 'react';
import { summarizeConditions } from '../automations/rule-summary';
import type { DragHandleProps, DropTargetProps } from '../automations/use-row-drag';

export interface SplitListRowProps {
  readonly split: Split;
  readonly accounts: readonly MailAccount[];
  readonly color: string;
  readonly place: 'above' | 'below' | null;
  readonly focusHandle: boolean;
  readonly handle: DragHandleProps;
  readonly target: DropTargetProps;
  readonly onOpen: () => void;
}

export function SplitListRow({
  split,
  accounts,
  color,
  place,
  focusHandle,
  handle,
  target,
  onOpen,
}: SplitListRowProps) {
  const grip = useRef<HTMLButtonElement>(null);
  const account = accounts.find((item) => item.id === split.accountId);
  useEffect(() => {
    if (focusHandle) {
      grip.current?.focus();
    }
  }, [focusHandle, split.order]);
  return (
    <li
      className={cx('au-row', place !== null && `drop-${place}`)}
      aria-label={`Split ${split.name}`}
      {...target}
    >
      <button
        ref={grip}
        type="button"
        className="au-grip"
        aria-label={`Presunúť split ${split.name}`}
        title="Potiahni alebo použi Alt a šípky"
        {...handle}
      />
      <button
        type="button"
        className="au-open"
        aria-label={`Otvoriť split ${split.name}`}
        onClick={onOpen}
      >
        <span className="au-name">
          <span className="acc-dot" style={{ ['--a' as string]: color }} />
          <b>{split.name}</b>
          {split.exclusive ? <span className="scope">Mimo Dôležitých</span> : null}
        </span>
        <span className="au-sum">{summarizeConditions(splitCriteria(split))}</span>
      </button>
      <span className="chip au-acc">{account?.displayName ?? 'Všetky účty'}</span>
      <span className="au-chev" aria-hidden="true">
        <Icon name="forward" size={14} />
      </span>
    </li>
  );
}

import type { MailboxId } from '@relay/shared';
import { cx, Icon } from '@relay/ui';
import { type ActionTargets, moveTargetView } from './action-targets';

export interface MoveTargetProps {
  readonly mailboxId: MailboxId;
  readonly targets: ActionTargets;
  readonly disabled: boolean;
  readonly onOpen: (event: { readonly currentTarget: Element }) => void;
}

export function MoveTarget({ mailboxId, targets, disabled, onOpen }: MoveTargetProps) {
  const view = moveTargetView(mailboxId, targets);
  return (
    <button
      type="button"
      className={cx('au-target', view.broken && 'broken')}
      aria-label={`Zmeniť cieľ: ${view.label}`}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onOpen}
    >
      {view.label}
      <Icon name="down" size={12} />
    </button>
  );
}

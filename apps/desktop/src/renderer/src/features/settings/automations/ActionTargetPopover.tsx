import type { AccountId, AutomationAction, MailAccount } from '@relay/shared';
import { type AnchorRect, Popover } from '@relay/ui';
import { ActionTargetMenu, type TargetKind } from './ActionTargetMenu';

export interface TargetPicking {
  readonly kind: TargetKind;
  readonly anchor: AnchorRect;
  readonly current: AutomationAction | null;
}

export interface ActionTargetPopoverProps {
  readonly picking: TargetPicking;
  readonly title: string;
  readonly actions: readonly AutomationAction[];
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly onPick: (action: AutomationAction, accountId: AccountId) => void;
  readonly onClose: () => void;
}

export function ActionTargetPopover({
  picking,
  title,
  actions,
  accountId,
  accounts,
  onPick,
  onClose,
}: ActionTargetPopoverProps) {
  return (
    <Popover anchor={picking.anchor} label={title} className="aup" width={280} onClose={onClose}>
      <ActionTargetMenu
        kind={picking.kind}
        actions={actions}
        current={picking.current}
        accountId={accountId}
        accounts={accounts}
        onPick={onPick}
      />
    </Popover>
  );
}

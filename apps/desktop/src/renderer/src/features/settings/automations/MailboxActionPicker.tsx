import type { AccountId, MailboxId } from '@relay/shared';
import { useMailboxes } from '../../../data/hooks/use-mail-queries';
import { moveTargetsOf } from '../../mail/move-targets';
import { moveChoiceLabel } from './action-targets';
import { OptionList } from './OptionList';

export interface MailboxActionPickerProps {
  readonly accountId: AccountId;
  readonly gmail: boolean;
  readonly current: MailboxId | null;
  readonly onPick: (mailboxId: MailboxId) => void;
}

export function MailboxActionPicker({
  accountId,
  gmail,
  current,
  onPick,
}: MailboxActionPickerProps) {
  const mailboxes = useMailboxes(accountId);
  if (mailboxes.data === undefined) {
    return <p className="au-hint">Načítavam priečinky…</p>;
  }
  const targets = moveTargetsOf(mailboxes.data);
  const labelled = gmail || mailboxes.data.some((mailbox) => mailbox.role === 'label');
  return (
    <OptionList
      title={moveChoiceLabel(labelled)}
      options={targets.map((target) => ({
        key: target.mailbox.id,
        label: target.label,
        checked: target.mailbox.id === current,
        pick: () => {
          onPick(target.mailbox.id);
        },
      }))}
    />
  );
}

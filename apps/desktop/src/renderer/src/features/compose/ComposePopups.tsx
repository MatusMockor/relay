import type { AccountId } from '@relay/shared';
import { type AnchorRect, ConfirmDialog } from '@relay/ui';
import { AccountMenu } from '../folders/AccountMenu';
import { useAccountsModel } from '../mail/use-accounts-model';
import { schedulePresets } from '../reminders/presets';
import { WhenPicker } from '../reminders/WhenPicker';

export type Popup =
  | { readonly kind: 'from' | 'schedule'; readonly anchor: AnchorRect }
  | { readonly kind: 'confirm' }
  | null;

export interface ComposePopupsProps {
  readonly popup: Popup;
  readonly title: string;
  readonly body: string;
  readonly accountId: AccountId | undefined;
  readonly onClose: () => void;
  readonly onAccount: (id: AccountId | undefined) => void;
  readonly onSend: (date: Date | null) => void;
}

export function ComposePopups({
  popup,
  title,
  body,
  accountId,
  onClose,
  onAccount,
  onSend,
}: ComposePopupsProps) {
  const model = useAccountsModel();
  if (popup === null) {
    return null;
  }
  if (popup.kind === 'confirm') {
    return (
      <ConfirmDialog
        title={title}
        text={body}
        confirmLabel="Odoslať"
        onCancel={onClose}
        onConfirm={() => {
          onSend(null);
        }}
      />
    );
  }
  if (popup.kind === 'schedule') {
    return (
      <WhenPicker
        anchor={popup.anchor}
        title="Naplánovať odoslanie"
        presets={schedulePresets(new Date())}
        now={new Date()}
        onClose={onClose}
        onPick={onSend}
      />
    );
  }
  if (accountId === undefined) {
    return null;
  }
  return (
    <AccountMenu
      anchor={popup.anchor}
      title="Odoslať z účtu"
      accounts={model.accounts}
      current={accountId}
      withAll={false}
      onClose={onClose}
      onPick={(id) => {
        onAccount(model.byId.get(id)?.id);
      }}
    />
  );
}

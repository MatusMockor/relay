import { Toast } from '@relay/ui';
import { undoLast, useToastStore } from '../../state/toast-store';
import { setUi, useUiStore } from '../../state/ui-store';
import { ComposeHost } from '../compose/ComposeSheet';
import { AccountMenu } from '../folders/AccountMenu';
import { LabelHost } from '../labels/LabelHost';
import { MoveHost } from '../mail/MoveHost';
import { selectScope } from '../mail/navigation';
import { useAccountsModel } from '../mail/use-accounts-model';
import { CommandPalette } from '../palette/CommandPalette';
import { ReminderHost } from '../reminders/ReminderHost';
import { SettingsSheet } from '../settings/SettingsSheet';
import { ShortcutsSheet } from '../shortcuts/ShortcutsSheet';
import { useThreadList } from '../../data/hooks/use-mail-queries';

function AccountsPopover() {
  const overlay = useUiStore((state) => state.overlay);
  const scope = useUiStore((state) => state.scope);
  const model = useAccountsModel();
  const inbox = useThreadList({ view: 'inbox' });
  if (overlay?.kind !== 'accounts') {
    return null;
  }
  const unread = (id: string) =>
    (inbox.data?.items ?? []).filter(
      (thread) => thread.unread && (id === 'all' || thread.accountId === id),
    ).length;
  return (
    <AccountMenu
      anchor={overlay.anchor}
      title="Účty"
      accounts={model.accounts}
      current={scope}
      withAll={model.multi}
      unread={unread}
      onClose={() => {
        setUi({ overlay: null });
      }}
      onPick={(id) => {
        selectScope(id === 'all' ? 'all' : (model.byId.get(id)?.id ?? 'all'));
      }}
      onAdd={() => {
        setUi({ overlay: { kind: 'settings', section: 'accounts', adding: true } });
      }}
    />
  );
}

export function OverlayHost() {
  const overlay = useUiStore((state) => state.overlay);
  const toast = useToastStore((state) => state.toast);
  return (
    <>
      {overlay?.kind === 'palette' ? <CommandPalette /> : null}
      {overlay?.kind === 'shortcuts' ? <ShortcutsSheet /> : null}
      {overlay?.kind === 'settings' ? (
        <SettingsSheet section={overlay.section} adding={overlay.adding} />
      ) : null}
      <ComposeHost />
      <ReminderHost />
      <MoveHost />
      <LabelHost />
      <AccountsPopover />
      {toast === null ? null : (
        <Toast key={toast.id} message={toast.message} onUndo={toast.undo ? undoLast : undefined} />
      )}
    </>
  );
}

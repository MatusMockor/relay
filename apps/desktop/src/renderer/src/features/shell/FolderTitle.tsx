import { FolderIcon } from '@relay/ui';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { VIEW_META, viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { useAccountsModel } from '../mail/use-accounts-model';

const ICONS = {
  inbox: 'inbox',
  task: 'task',
  clock: 'clock',
  check: 'check',
  send: 'send',
  file: 'file',
  calendar: 'calendar',
  trash: 'trash',
} as const;

export function FolderTitle() {
  const folder = useUiStore((state) => state.folder);
  const { items } = useMailActions();
  const labels = useLabels();
  const model = useAccountsModel();
  const count = items.length;
  const where = model.unified
    ? 'všetky účty'
    : model.multi && model.current !== null
      ? `účet ${model.current.displayName}`
      : '';
  if (folder.kind === 'label') {
    const label = labels.data?.find((item) => item.id === folder.labelId);
    return (
      <div className="a-title">
        <h2>
          <span
            className="lbl-dot"
            style={{ ['--d' as string]: label?.color ?? 'var(--accent)' }}
          />
          {label?.name ?? 'Štítok'}
          {count > 0 ? <b>{count}</b> : null}
        </h2>
        <span className="sub">{`Štítok${model.multi ? ` účtu ${model.accountName(label?.accountId ?? '')}` : ''} · konverzácie v Doručenej pošte`}</span>
      </div>
    );
  }
  const meta = VIEW_META[viewOf(folder)];
  return (
    <div className="a-title">
      <h2>
        <FolderIcon name={ICONS[meta.icon]} />
        {meta.label}
        {count > 0 ? <b>{count}</b> : null}
      </h2>
      <span className="sub">{[meta.sub, where].filter((part) => part !== '').join(' · ')}</span>
    </div>
  );
}

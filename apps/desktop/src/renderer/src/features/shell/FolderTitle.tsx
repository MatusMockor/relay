import { FolderIcon } from '@relay/ui';
import { folderIconOf } from '../folders/folder-icons';
import { labelHue } from '../folders/label-colors';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { VIEW_META, viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { useAccountsModel } from '../mail/use-accounts-model';
import { KeyHint } from './KeyHint';

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
            style={{ ['--d' as string]: labelHue(labels.data ?? [], folder.labelId) }}
          />
          {label?.name ?? 'Štítok'}
          {count > 0 ? <b>{count}</b> : null}
        </h2>
        <span className="sub">{`Štítok${model.multi ? ` účtu ${model.accountName(label?.accountId ?? '')}` : ''} · konverzácie v Doručenej pošte`}</span>
      </div>
    );
  }
  const view = viewOf(folder);
  const meta = VIEW_META[view];
  const hint = count > 0 ? meta.hint : undefined;
  const text = [meta.sub, hint, where].filter((part) => part !== undefined && part !== '');
  return (
    <div className="a-title">
      <h2>
        <FolderIcon name={folderIconOf(view)} />
        {meta.label}
        {count > 0 ? <b>{count}</b> : null}
      </h2>
      <span className="sub">
        <KeyHint text={text.join(' · ')} />
      </span>
    </div>
  );
}

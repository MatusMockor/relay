import { FolderIcon } from '@relay/ui';
import { folderIconOf } from '../folders/folder-icons';
import { useFolderMailbox } from '../folders/use-folder-mailbox';
import { useNameColors } from '../colors/use-name-colors';
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
  const colors = useNameColors();
  const model = useAccountsModel();
  const mailbox = useFolderMailbox(folder);
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
          <span className="lbl-dot" style={{ ['--d' as string]: colors.of(label?.name ?? '') }} />
          <span className="a-tt" title={label?.name ?? 'Štítok'}>
            {label?.name ?? 'Štítok'}
          </span>
          {count > 0 ? <b>{count}</b> : null}
        </h2>
        <span className="sub">{`Štítok${model.multi ? ` účtu ${model.accountName(label?.accountId ?? '')}` : ''} · konverzácie mimo Koša a Spamu`}</span>
      </div>
    );
  }
  if (folder.kind === 'mailbox') {
    const name = mailbox?.name ?? 'Priečinok';
    return (
      <div className="a-title">
        <h2>
          <FolderIcon name="folder" />
          <span className="a-tt" title={mailbox?.path ?? name}>
            {name}
          </span>
          {count > 0 ? <b>{count}</b> : null}
        </h2>
        <span className="sub">{`Priečinok${model.multi ? ` účtu ${model.accountName(folder.accountId)}` : ''}${mailbox === null ? '' : ` · ${mailbox.path}`}`}</span>
      </div>
    );
  }
  const view = viewOf(folder);
  const meta = VIEW_META[view];
  const hint = count > 0 ? meta.hint : undefined;
  const text = [meta.sub, hint].filter((part) => part !== undefined && part !== '');
  return (
    <div className="a-title">
      <h2>
        <FolderIcon name={folderIconOf(view)} />
        <span className="a-tt" title={meta.label}>
          {meta.label}
        </span>
        {count > 0 ? <b>{count}</b> : null}
      </h2>
      <span className="sub">
        <KeyHint text={text.join(' · ')} />
        {where === '' ? null : `${text.length > 0 ? ' · ' : ''}${where}`}
      </span>
    </div>
  );
}

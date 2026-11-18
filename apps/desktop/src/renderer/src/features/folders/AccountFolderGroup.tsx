import type { Label, MailAccount, Mailbox } from '@relay/shared';
import { FolderIcon, Icon } from '@relay/ui';
import { useMemo } from 'react';
import { toggleCollapsed, useUiStore } from '../../state/ui-store';
import { useNameColors } from '../colors/use-name-colors';
import { accountHue } from '../colors/name-colors';
import { selectFolder } from '../mail/navigation';
import { labelEntries, mailboxEntries } from './folder-sections';
import { buildFolderTree } from './folder-tree';
import { FolderTreeRows, type TreeLeaf } from './FolderTreeRows';

interface AccountFolderGroupProps {
  readonly account: MailAccount;
  readonly mailboxes: readonly Mailbox[];
  readonly labels: readonly Label[];
  readonly grouped: boolean;
}

function AccountHeader({
  account,
  shut,
}: {
  readonly account: MailAccount;
  readonly shut: boolean;
}) {
  return (
    <button
      type="button"
      className={`ft-acct${shut ? ' shut' : ''}`}
      aria-expanded={!shut}
      onClick={() => {
        toggleCollapsed(`acct:${account.id}`);
      }}
    >
      <span className="ft-acct-dot" style={{ ['--d' as string]: accountHue(account.color) }} />
      <span className="fl">{account.displayName}</span>
      <Icon name="down" size={12} />
    </button>
  );
}

export function AccountFolderGroup({
  account,
  mailboxes,
  labels,
  grouped,
}: AccountFolderGroupProps) {
  const folder = useUiStore((state) => state.folder);
  const collapsed = useUiStore((state) => state.collapsed[`acct:${account.id}`] === true);
  const shut = grouped && collapsed;
  const colors = useNameColors();
  const folders = useMemo(() => buildFolderTree(mailboxEntries(mailboxes)), [mailboxes]);
  const labelTree = useMemo(() => buildFolderTree(labelEntries(labels)), [labels]);
  if (folders.length === 0 && labelTree.length === 0) {
    return null;
  }
  const mailboxLeaf = (mailbox: Mailbox): TreeLeaf => ({
    icon: <FolderIcon name="folder" />,
    on: folder.kind === 'mailbox' && folder.mailboxId === mailbox.id,
    count: mailbox.unreadCount,
    title: mailbox.path,
    onSelect: () => {
      selectFolder({ kind: 'mailbox', mailboxId: mailbox.id, accountId: account.id });
    },
  });
  const labelLeaf = (label: Label): TreeLeaf => ({
    icon: <span className="lbl-dot" style={{ ['--d' as string]: colors.of(label.name) }} />,
    on: folder.kind === 'label' && folder.labelId === label.id,
    count: 0,
    title: label.name,
    onSelect: () => {
      selectFolder({ kind: 'label', labelId: label.id });
    },
  });
  const Heading = grouped ? 'h6' : 'h5';
  return (
    <section className="ft-group" aria-label={grouped ? account.displayName : undefined}>
      {grouped ? <AccountHeader account={account} shut={shut} /> : null}
      {shut ? null : (
        <>
          {folders.length === 0 ? null : <Heading>Priečinky</Heading>}
          <FolderTreeRows nodes={folders} scope={`mbx:${account.id}`} leafOf={mailboxLeaf} />
          {labelTree.length === 0 ? null : <Heading>Štítky</Heading>}
          <FolderTreeRows nodes={labelTree} scope={`lbl:${account.id}`} leafOf={labelLeaf} />
        </>
      )}
    </section>
  );
}

import type { Label, MailAccount, Mailbox } from '@relay/shared';
import { Icon } from '@relay/ui';
import { type ElementType, useMemo } from 'react';
import { toggleCollapsed, useUiStore } from '../../state/ui-store';
import { accountHue } from '../colors/name-colors';
import { FOLDER_COPY } from './edit/folder-copy';
import { setFolderEdit } from './edit/folder-edit-store';
import { CreateEditor } from './edit/FolderEditors';
import { useFolderLeaves } from './edit/use-folder-leaves';
import { labelEntries, mailboxEntries } from './folder-sections';
import { buildFolderTree } from './folder-tree';
import { FolderTreeRows } from './FolderTreeRows';

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

function FoldersHeading({
  Heading,
  account,
}: {
  readonly Heading: ElementType;
  readonly account: MailAccount;
}) {
  const label = `${FOLDER_COPY.folder.newTop} v ${account.displayName}`;
  return (
    <div className="ft-head">
      <Heading>Priečinky</Heading>
      <button
        type="button"
        className="ft-add"
        title={FOLDER_COPY.folder.newTop}
        aria-label={label}
        onClick={() => {
          setFolderEdit({ kind: 'create', accountId: account.id, parent: null });
        }}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

const keepsFolders = (account: MailAccount, mailboxes: readonly Mailbox[]): boolean =>
  mailboxes.length > 0 &&
  account.provider !== 'gmail' &&
  !mailboxes.some((mailbox) => mailbox.role === 'label');

export function AccountFolderGroup({
  account,
  mailboxes,
  labels,
  grouped,
}: AccountFolderGroupProps) {
  const collapsed = useUiStore((state) => state.collapsed[`acct:${account.id}`] === true);
  const shut = grouped && collapsed;
  const leaves = useFolderLeaves(account, mailboxes);
  const folders = useMemo(() => buildFolderTree(mailboxEntries(mailboxes)), [mailboxes]);
  const labelTree = useMemo(() => buildFolderTree(labelEntries(labels)), [labels]);
  const withFolders = keepsFolders(account, mailboxes);
  if (!withFolders && labelTree.length === 0) {
    return null;
  }
  const Heading = grouped ? 'h6' : 'h5';
  return (
    <section className="ft-group" aria-label={grouped ? account.displayName : undefined}>
      {grouped ? <AccountHeader account={account} shut={shut} /> : null}
      {shut ? null : (
        <>
          {withFolders ? <FoldersHeading Heading={Heading} account={account} /> : null}
          {leaves.creatingTop ? (
            <CreateEditor accountId={account.id} parent={null} kind="folder" depth={0} />
          ) : null}
          <FolderTreeRows nodes={folders} scope={`mbx:${account.id}`} leafOf={leaves.mailboxLeaf} />
          {labelTree.length === 0 ? null : <Heading>Štítky</Heading>}
          <FolderTreeRows nodes={labelTree} scope={`lbl:${account.id}`} leafOf={leaves.labelLeaf} />
        </>
      )}
    </section>
  );
}

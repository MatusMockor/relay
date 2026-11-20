import type { Label, MailAccount, Mailbox } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useMemo } from 'react';
import { toggleCollapsed, useUiStore } from '../../state/ui-store';
import { accountHue } from '../colors/name-colors';
import { FOLDER_COPY } from './edit/folder-copy';
import { type FolderKind, setFolderEdit } from './edit/folder-edit-store';
import { CreateEditor } from './edit/FolderEditors';
import { LabelCreateEditor } from './edit/LabelCreateEditor';
import { useFolderLeaves } from './edit/use-folder-leaves';
import { labelEntries, mailboxEntries } from './folder-sections';
import { buildFolderTree } from './folder-tree';
import { FolderTreeRows } from './FolderTreeRows';
import type { SectionAdd } from './SectionHeading';
import { sectionKey, sidebarSections } from './sidebar-sections';
import { SidebarSection } from './SidebarSection';

interface AccountFolderGroupProps {
  readonly account: MailAccount;
  readonly mailboxes: readonly Mailbox[];
  readonly mailboxesLoaded: boolean;
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

const addOf = (kind: FolderKind, account: MailAccount, onAdd: () => void): SectionAdd => ({
  title: FOLDER_COPY[kind].newTop,
  label: `${FOLDER_COPY[kind].newTop} v ${account.displayName}`,
  onAdd,
});

export function AccountFolderGroup({
  account,
  mailboxes,
  mailboxesLoaded,
  labels,
  grouped,
}: AccountFolderGroupProps) {
  const collapsed = useUiStore((state) => state.collapsed[`acct:${account.id}`] === true);
  const shut = grouped && collapsed;
  const leaves = useFolderLeaves(account, mailboxes);
  const folders = useMemo(() => buildFolderTree(mailboxEntries(mailboxes)), [mailboxes]);
  const labelTree = useMemo(() => buildFolderTree(labelEntries(labels)), [labels]);
  const sections = sidebarSections({
    account,
    mailboxes,
    mailboxesLoaded,
    labelCount: labels.length,
  });
  if (!sections.folders && !sections.labels) {
    return null;
  }
  const Heading = grouped ? 'h6' : 'h5';
  return (
    <section className="ft-group" aria-label={grouped ? account.displayName : undefined}>
      {grouped ? <AccountHeader account={account} shut={shut} /> : null}
      {shut ? null : (
        <>
          {sections.folders ? (
            <SidebarSection
              Heading={Heading}
              title="Priečinky"
              collapseKey={sectionKey('mbx', account.id)}
              add={addOf('folder', account, () => {
                setFolderEdit({ kind: 'create', accountId: account.id, parent: null });
              })}
            >
              {leaves.creatingTop ? (
                <CreateEditor
                  key={leaves.editSeq}
                  accountId={account.id}
                  parent={null}
                  kind="folder"
                  depth={0}
                />
              ) : null}
              <FolderTreeRows
                nodes={folders}
                scope={`mbx:${account.id}`}
                leafOf={leaves.mailboxLeaf}
              />
            </SidebarSection>
          ) : null}
          {sections.labels ? (
            <SidebarSection
              Heading={Heading}
              title="Štítky"
              collapseKey={sectionKey('lbl', account.id)}
              add={addOf('label', account, () => {
                setFolderEdit({ kind: 'create-label', accountId: account.id });
              })}
            >
              {leaves.creatingLabel ? (
                <LabelCreateEditor key={leaves.editSeq} accountId={account.id} depth={0} />
              ) : null}
              <FolderTreeRows
                nodes={labelTree}
                scope={`lbl:${account.id}`}
                leafOf={leaves.labelLeaf}
              />
            </SidebarSection>
          ) : null}
        </>
      )}
    </section>
  );
}

import type { AccountId, FolderView, LabelId, MailboxId, SplitId } from '@relay/shared';
import type { ThreadListParams } from '../data/MailClient';

export type AccountScope = AccountId | 'all';
export type SecondaryView = Exclude<FolderView, 'inbox' | 'mailbox' | 'label'>;
export type NavView = 'inbox' | SecondaryView;

export type Folder =
  | { readonly kind: 'inbox'; readonly splitId: SplitId | null }
  | { readonly kind: 'view'; readonly view: SecondaryView }
  | { readonly kind: 'label'; readonly labelId: LabelId }
  | { readonly kind: 'mailbox'; readonly mailboxId: MailboxId; readonly accountId: AccountId };

export const INBOX: Folder = { kind: 'inbox', splitId: null };

export const folderKey = (folder: Folder): string => {
  if (folder.kind === 'inbox') {
    return `inbox:${folder.splitId ?? 'main'}`;
  }
  if (folder.kind === 'mailbox') {
    return `mailbox:${folder.mailboxId}`;
  }
  return folder.kind === 'view' ? `view:${folder.view}` : `label:${folder.labelId}`;
};

export const sameFolder = (a: Folder, b: Folder): boolean => folderKey(a) === folderKey(b);

export const viewOf = (folder: Folder): FolderView => {
  if (folder.kind === 'view') {
    return folder.view;
  }
  return folder.kind === 'inbox' ? 'inbox' : folder.kind;
};

export const usesThreadList = (folder: Folder): boolean =>
  folder.kind !== 'view' || (folder.view !== 'drafts' && folder.view !== 'scheduled');

export const isAccountFolder = (folder: Folder): boolean =>
  folder.kind === 'label' || folder.kind === 'mailbox';

export const listParamsOf = (folder: Folder, scope: AccountScope, q: string): ThreadListParams => {
  const base = {
    view: viewOf(folder),
    accountId: scope === 'all' ? undefined : scope,
    q: q.trim() === '' ? undefined : q.trim(),
  };
  if (folder.kind === 'inbox') {
    return { ...base, splitId: folder.splitId ?? undefined };
  }
  if (folder.kind === 'mailbox') {
    return { ...base, mailboxId: folder.mailboxId };
  }
  return folder.kind === 'label' ? { ...base, labelId: folder.labelId } : base;
};

export interface ViewMeta {
  readonly label: string;
  readonly icon:
    | 'inbox'
    | 'task'
    | 'clock'
    | 'check'
    | 'send'
    | 'file'
    | 'calendar'
    | 'spam'
    | 'trash'
    | 'folder'
    | 'label';
  readonly g: string;
}

export const VIEW_META: Readonly<Record<FolderView, ViewMeta>> = {
  inbox: { label: 'Doručená pošta', icon: 'inbox', g: 'I' },
  tasks: { label: 'Úlohy', icon: 'task', g: 'U' },
  reminders: { label: 'Pripomenuté', icon: 'clock', g: 'H' },
  done: { label: 'Hotovo', icon: 'check', g: 'E' },
  sent: { label: 'Odoslané', icon: 'send', g: 'T' },
  drafts: { label: 'Koncepty', icon: 'file', g: 'D' },
  scheduled: { label: 'Naplánované', icon: 'calendar', g: 'N' },
  spam: { label: 'Spam', icon: 'spam', g: 'P' },
  trash: { label: 'Kôš', icon: 'trash', g: 'K' },
  mailbox: { label: 'Priečinok', icon: 'folder', g: '' },
  label: { label: 'Štítok', icon: 'label', g: '' },
};

export const NAV_VIEWS: readonly NavView[] = [
  'inbox',
  'tasks',
  'reminders',
  'done',
  'sent',
  'drafts',
  'scheduled',
  'spam',
  'trash',
];

export const MAIN_TAB_LABEL = 'Dôležité';

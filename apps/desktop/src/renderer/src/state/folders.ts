import type {
  AccountId,
  FolderView,
  LabelId,
  MailboxId,
  SplitId,
  TaskSystemConnectionId,
} from '@relay/shared';
import type { ThreadListParams } from '../data/MailClient';

export type AccountScope = AccountId | 'all';
export type SecondaryView = Exclude<FolderView, 'inbox' | 'mailbox' | 'label'>;
export type NavView = 'inbox' | SecondaryView;

export type Folder =
  | { readonly kind: 'inbox'; readonly splitId: SplitId | null }
  | { readonly kind: 'view'; readonly view: SecondaryView }
  | { readonly kind: 'label'; readonly labelId: LabelId }
  | { readonly kind: 'mailbox'; readonly mailboxId: MailboxId; readonly accountId: AccountId }
  | { readonly kind: 'taskSystem'; readonly connectionId: TaskSystemConnectionId };

export type MailFolder = Exclude<Folder, { readonly kind: 'taskSystem' }>;

export const INBOX: MailFolder = { kind: 'inbox', splitId: null };

export const isMailFolder = (folder: Folder): folder is MailFolder => folder.kind !== 'taskSystem';

export const mailFolderOf = (folder: Folder): MailFolder => (isMailFolder(folder) ? folder : INBOX);

export const taskSystemFolder = (connectionId: TaskSystemConnectionId): Folder => ({
  kind: 'taskSystem',
  connectionId,
});

export const folderKey = (folder: Folder): string => {
  if (folder.kind === 'inbox') {
    return `inbox:${folder.splitId ?? 'main'}`;
  }
  if (folder.kind === 'mailbox') {
    return `mailbox:${folder.mailboxId}`;
  }
  if (folder.kind === 'taskSystem') {
    return `taskSystem:${folder.connectionId}`;
  }
  return folder.kind === 'view' ? `view:${folder.view}` : `label:${folder.labelId}`;
};

export const sameFolder = (a: Folder, b: Folder): boolean => folderKey(a) === folderKey(b);

export const viewOf = (folder: Folder): FolderView => {
  const mail = mailFolderOf(folder);
  if (mail.kind === 'view') {
    return mail.view;
  }
  return mail.kind === 'inbox' ? 'inbox' : mail.kind;
};

export const usesThreadList = (folder: Folder): boolean => {
  if (folder.kind === 'taskSystem') {
    return false;
  }
  return folder.kind !== 'view' || (folder.view !== 'drafts' && folder.view !== 'scheduled');
};

export const isAccountFolder = (folder: Folder): boolean =>
  folder.kind === 'label' || folder.kind === 'mailbox';

export const listParamsOf = (target: Folder, scope: AccountScope, q: string): ThreadListParams => {
  const folder = mailFolderOf(target);
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
  readonly sub?: string;
}

export const VIEW_META: Readonly<Record<FolderView, ViewMeta>> = {
  inbox: { label: 'Doručená pošta', icon: 'inbox', g: 'I' },
  tasks: {
    label: 'Moje úlohy',
    icon: 'task',
    g: 'U',
    sub: 'Úlohy z mailov, z AI a ručne vytvorené, zoradené podľa priority',
  },
  reminders: { label: 'Pripomenuté', icon: 'clock', g: 'H' },
  done: { label: 'Hotovo', icon: 'check', g: 'E' },
  archive: { label: 'Archív', icon: 'file', g: 'A' },
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
  'archive',
  'sent',
  'drafts',
  'scheduled',
  'spam',
  'trash',
];

export const MAIN_TAB_LABEL = 'Dôležité';

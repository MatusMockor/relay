import type { AccountId, FolderView, LabelId, SplitId } from '@relay/shared';
import type { ThreadListParams } from '../data/MailClient';

export type AccountScope = AccountId | 'all';
export type SecondaryView = Exclude<FolderView, 'inbox'>;

export type Folder =
  | { readonly kind: 'inbox'; readonly splitId: SplitId | null }
  | { readonly kind: 'view'; readonly view: SecondaryView }
  | { readonly kind: 'label'; readonly labelId: LabelId };

export const INBOX: Folder = { kind: 'inbox', splitId: null };

export const folderKey = (folder: Folder): string => {
  if (folder.kind === 'inbox') {
    return `inbox:${folder.splitId ?? 'main'}`;
  }
  return folder.kind === 'view' ? `view:${folder.view}` : `label:${folder.labelId}`;
};

export const sameFolder = (a: Folder, b: Folder): boolean => folderKey(a) === folderKey(b);

export const viewOf = (folder: Folder): FolderView =>
  folder.kind === 'view' ? folder.view : 'inbox';

export const listParamsOf = (folder: Folder, scope: AccountScope, q: string): ThreadListParams => {
  const base = {
    view: viewOf(folder),
    accountId: scope === 'all' ? undefined : scope,
    q: q.trim() === '' ? undefined : q.trim(),
  };
  if (folder.kind === 'inbox') {
    return { ...base, splitId: folder.splitId ?? undefined };
  }
  return folder.kind === 'label' ? { ...base, labelId: folder.labelId } : base;
};

export interface ViewMeta {
  readonly label: string;
  readonly icon: 'inbox' | 'task' | 'clock' | 'check' | 'send' | 'file' | 'calendar' | 'trash';
  readonly g: string;
  readonly sub: string;
}

export const VIEW_META: Readonly<Record<FolderView, ViewMeta>> = {
  inbox: { label: 'Doručená pošta', icon: 'inbox', g: 'I', sub: '' },
  tasks: { label: 'Úlohy', icon: 'task', g: 'U', sub: 'Úlohy z Jiry a z AI, ktoré čakajú na teba' },
  reminders: {
    label: 'Pripomenuté',
    icon: 'clock',
    g: 'H',
    sub: 'Vrátia sa do Doručenej pošty v nastavený čas',
  },
  done: { label: 'Hotovo', icon: 'check', g: 'E', sub: 'Vybavené konverzácie, E vráti späť' },
  sent: { label: 'Odoslané', icon: 'send', g: 'T', sub: 'Tvoje odpovede a nové správy' },
  drafts: {
    label: 'Koncepty',
    icon: 'file',
    g: 'D',
    sub: 'Rozpísané odpovede a správy, Esc ich uloží sem',
  },
  scheduled: {
    label: 'Naplánované',
    icon: 'calendar',
    g: 'N',
    sub: 'Odošlú sa automaticky v nastavený čas',
  },
  trash: { label: 'Kôš', icon: 'trash', g: 'K', sub: 'E obnoví vybranú konverzáciu' },
};

export const NAV_VIEWS: readonly FolderView[] = [
  'inbox',
  'tasks',
  'reminders',
  'done',
  'sent',
  'drafts',
  'scheduled',
  'trash',
];

export const MAIN_TAB_LABEL = 'Dôležité';

import type { Split, ThreadDetail } from '@relay/shared';
import { type Folder, folderKey, MAIN_TAB_LABEL } from '../../state/folders';
import type { AccountScope } from '../../state/folders';

export const isTyping = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

export const G_VIEWS: Readonly<Record<string, Folder>> = {
  i: { kind: 'inbox', splitId: null },
  u: { kind: 'view', view: 'tasks' },
  h: { kind: 'view', view: 'reminders' },
  e: { kind: 'view', view: 'done' },
  t: { kind: 'view', view: 'sent' },
  s: { kind: 'view', view: 'sent' },
  d: { kind: 'view', view: 'drafts' },
  n: { kind: 'view', view: 'scheduled' },
  p: { kind: 'view', view: 'spam' },
  k: { kind: 'view', view: 'trash' },
};

export const tabFolders = (splits: readonly Split[], hasTasks: boolean): Folder[] => [
  { kind: 'inbox', splitId: null },
  ...(hasTasks ? [{ kind: 'view' as const, view: 'tasks' as const }] : []),
  ...splits.map((split) => ({ kind: 'inbox' as const, splitId: split.id })),
];

export const cycleFolder = (folders: readonly Folder[], current: Folder, delta: number): Folder => {
  const index = folders.findIndex((folder) => folderKey(folder) === folderKey(current));
  if (index < 0) {
    return folders[0] ?? current;
  }
  return folders[(index + delta + folders.length) % folders.length] ?? current;
};

export const scopeForDigit = (
  digit: number,
  accountIds: readonly string[],
): AccountScope | null => {
  const ids: AccountScope[] = ['all', ...(accountIds as AccountScope[])];
  return ids[digit - 1] ?? null;
};

export const suggestionAt = (detail: ThreadDetail | undefined, index: number): string | null =>
  detail?.replySuggestions[index]?.body ?? null;

export const MAIN_LABEL = MAIN_TAB_LABEL;

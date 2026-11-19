import type { ContextMenuItem, ThreadSummary } from '@relay/shared';

const entry = (id: string, label: string): ContextMenuItem => ({
  type: 'item',
  id,
  label,
  enabled: true,
});

const SEPARATOR: ContextMenuItem = { type: 'separator' };
const REMIND = entry('remind', 'Pripomenúť…');
const TRASH = entry('trash', 'Presunúť do koša');

const DEFAULT_ITEMS: readonly ContextMenuItem[] = [
  entry('done', 'Hotovo'),
  REMIND,
  SEPARATOR,
  TRASH,
];

const VIEW_ITEMS: Readonly<Record<string, readonly ContextMenuItem[]>> = {
  done: [entry('done', 'Vrátiť do Doručenej pošty'), SEPARATOR, TRASH],
  trash: [entry('done', 'Obnoviť')],
  spam: [entry('spam', 'Nie je spam'), SEPARATOR, TRASH],
  sent: [SEPARATOR, TRASH],
};

const readToggle = (thread: ThreadSummary): ContextMenuItem =>
  thread.unread
    ? entry('read', 'Označiť ako prečítané')
    : entry('unread', 'Označiť ako neprečítané');

export const threadMenuItems = (view: string, thread: ThreadSummary): ContextMenuItem[] => [
  readToggle(thread),
  ...(VIEW_ITEMS[view] ?? DEFAULT_ITEMS),
];

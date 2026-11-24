import type { SplitEntry, SplitId } from '@relay/shared';
import { useSplits, useThreadList } from '../../data/hooks/use-mail-queries';
import { type Folder, MAIN_TAB_LABEL, VIEW_META } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectFolder } from '../mail/navigation';

interface TabProps {
  readonly label: string;
  readonly folder: Folder;
  readonly active: boolean;
  readonly hint: string;
  readonly splitId?: SplitId;
  readonly view?: 'inbox' | 'tasks';
}

function SplitTab({ label, folder, active, hint, splitId, view = 'inbox' }: TabProps) {
  const scope = useUiStore((state) => state.scope);
  const list = useThreadList({ view, splitId, accountId: scope === 'all' ? undefined : scope });
  const items = list.data?.items ?? [];
  const unread = items.filter((thread) => thread.unread).length;
  if (!active && items.length === 0) {
    return null;
  }
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`a-tab${active ? ' on' : ''}`}
      title={hint}
      onClick={() => {
        selectFolder(folder);
      }}
    >
      {label}
      {unread > 0 ? <b>{unread}</b> : null}
    </button>
  );
}

export const splitsInScope = (splits: readonly SplitEntry[], scope: string): SplitEntry[] =>
  [...splits]
    .filter((split) => scope === 'all' || split.accountId === null || split.accountId === scope)
    .sort((a, b) => a.order - b.order);

const RESERVED_G = new Set(['I', 'U', 'H', 'E', 'T', 'S', 'D', 'N', 'P', 'K']);

const lettersOf = (value: string): string[] =>
  Array.from(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase(),
  );

export const splitGKey = (split: SplitEntry): string | null =>
  lettersOf(split.name).find((char) => /[A-Z]/.test(char) && !RESERVED_G.has(char)) ?? null;

const splitHint = (split: SplitEntry): string => {
  const key = splitGKey(split);
  return key === null ? `Prejsť na ${split.name}` : `Prejsť na ${split.name} (G ${key})`;
};

export function SplitTabs() {
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const splits = splitsInScope(useSplits().data ?? [], scope);
  const isMain = folder.kind === 'inbox' && folder.splitId === null;
  const isTasks = folder.kind === 'view' && folder.view === 'tasks';
  return (
    <nav className="a-tabs" aria-label="Splity" role="tablist">
      <SplitTab
        label={MAIN_TAB_LABEL}
        folder={{ kind: 'inbox', splitId: null }}
        active={isMain}
        hint="Prejsť na Dôležité (G I)"
      />
      <SplitTab
        label={VIEW_META.tasks.label}
        folder={{ kind: 'view', view: 'tasks' }}
        active={isTasks}
        hint={`${VIEW_META.tasks.sub ?? VIEW_META.tasks.label} (G U)`}
        view="tasks"
      />
      {splits.map((split) => (
        <SplitTab
          key={split.id}
          label={split.name}
          splitId={split.id}
          folder={{ kind: 'inbox', splitId: split.id }}
          active={folder.kind === 'inbox' && folder.splitId === split.id}
          hint={splitHint(split)}
        />
      ))}
    </nav>
  );
}

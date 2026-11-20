import { useMemo } from 'react';
import { useSplits, useUserSettings } from '../../data/hooks/use-mail-queries';
import { folderKey, viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { useOpenItem } from '../mail/use-open-item';
import { EmptyFolder, InboxZero, NoHits } from './EmptyState';
import { buildListLayout } from './list-entries';
import { useRowContext } from './use-row-context';
import { ROW_HEIGHT } from './use-list-virtualizer';
import { VirtualThreadList } from './VirtualThreadList';

export function ThreadList() {
  const { items, loading, selectedKey, paging } = useMailActions();
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const query = useUiStore((state) => state.query);
  const chosen = useUiStore((state) => state.selected[folderKey(state.folder)]);
  const settings = useUserSettings();
  const splits = useSplits();
  const openItem = useOpenItem();
  const contextOf = useRowContext();
  const view = viewOf(folder);
  const now = new Date();
  const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const layout = useMemo(
    () => buildListLayout(items, view, new Date(year, month, day)),
    [items, view, year, month, day],
  );
  if (loading) {
    return <div className="a-list" aria-busy="true" />;
  }
  if (items.length === 0) {
    const empty =
      query.trim() !== '' ? (
        <NoHits query={query} />
      ) : folder.kind === 'inbox' ? (
        <InboxZero
          splitName={splits.data?.find((split) => split.id === folder.splitId)?.name ?? null}
        />
      ) : (
        <EmptyFolder view={view} />
      );
    return <div className="a-list">{empty}</div>;
  }
  const density = settings.data?.density === 'compact' ? 'compact' : 'normal';
  const listKey = `${folderKey(folder)}|${scope}|${query.trim()}|${density}`;
  return (
    <VirtualThreadList
      key={listKey}
      layout={layout}
      listKey={listKey}
      rowHeight={ROW_HEIGHT[density]}
      selectedKey={selectedKey}
      revealKey={chosen === selectedKey ? selectedKey : null}
      paging={paging}
      now={now}
      contextOf={contextOf}
      onOpen={openItem}
    />
  );
}

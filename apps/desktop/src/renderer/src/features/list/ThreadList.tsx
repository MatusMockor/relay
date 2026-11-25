import { useMemo } from 'react';
import { useSplits, useUserSettings } from '../../data/hooks/use-mail-queries';
import { folderKey, viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { useScopedSyncState } from '../mail/use-scoped-sync-state';
import { priorityOfItem } from '../tasks/thread-priorities';
import { usePendingPriorities } from '../tasks/use-pending-priorities';
import { useOpenItem } from '../mail/use-open-item';
import { EmptyFolder, InboxZero, InitialSyncState, NoHits } from './EmptyState';
import { buildListLayout } from './list-entries';
import { useRowContext } from './use-row-context';
import { ROW_HEIGHT } from './use-list-virtualizer';
import { VirtualThreadList } from './VirtualThreadList';

function SyncStrip({ text, ratio }: { readonly text: string; readonly ratio: number | null }) {
  return (
    <div className="sync-strip" role="status" aria-live="polite">
      <span className="sync-strip-text">{text}</span>
      <div
        className={ratio === null ? 'sync-bar indeterminate' : 'sync-bar'}
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
      >
        <i style={ratio === null ? undefined : { width: `${String(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

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
  const pending = usePendingPriorities();
  const sync = useScopedSyncState();
  const view = viewOf(folder);
  const now = new Date();
  const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const layout = useMemo(
    () => buildListLayout(items, view, new Date(year, month, day), priorityOfItem(pending)),
    [items, view, year, month, day, pending],
  );
  if (loading) {
    return <div className="a-list" aria-busy="true" />;
  }
  if (items.length === 0) {
    const empty =
      query.trim() !== '' ? (
        <NoHits query={query} />
      ) : sync.isInitialSync && sync.banner !== null ? (
        <InitialSyncState
          accountName={sync.accountName}
          text={sync.banner.text}
          ratio={sync.banner.ratio}
        />
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
    <>
      {sync.isInitialSync && sync.banner !== null ? (
        <SyncStrip text={sync.banner.text} ratio={sync.banner.ratio} />
      ) : null}
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
    </>
  );
}

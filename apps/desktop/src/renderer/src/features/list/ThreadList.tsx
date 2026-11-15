import { useEffect } from 'react';
import { useSplits, useTasks, useUserSettings } from '../../data/hooks/use-mail-queries';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { useAccountsModel } from '../mail/use-accounts-model';
import { useOpenItem } from '../mail/use-open-item';
import { EmptyFolder, InboxZero, NoHits } from './EmptyState';
import { groupItems, timeLabelOf } from './grouping';
import { ListRow } from './ListRow';

const reveal = (key: string | null) => {
  if (key === null) {
    return;
  }
  const row = document.querySelector(`[data-row="${key}"]`);
  if (row !== null && 'scrollIntoView' in row && typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest' });
  }
};

export function ThreadList() {
  const { items, loading, selectedKey } = useMailActions();
  const folder = useUiStore((state) => state.folder);
  const query = useUiStore((state) => state.query);
  const model = useAccountsModel();
  const settings = useUserSettings();
  const tasks = useTasks();
  const splits = useSplits();
  const openItem = useOpenItem();
  const view = viewOf(folder);
  const now = new Date();
  useEffect(() => {
    reveal(selectedKey);
  }, [selectedKey]);
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
  const oneLiners = settings.data?.ai.features.oneLiners ?? true;
  return (
    <div className="a-list" role="listbox" aria-label="Konverzácie">
      {groupItems(items, view, now).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="a-day">{group.label}</div>
          {group.items.map((item) => (
            <ListRow
              key={item.key}
              item={item}
              selected={item.key === selectedKey}
              onOpen={openItem}
              context={{
                view,
                query,
                unified: model.unified,
                oneLiners,
                time: timeLabelOf(item, view, now),
                account: model.byId.get(
                  item.kind === 'thread'
                    ? item.thread.accountId
                    : item.kind === 'draft'
                      ? item.draft.accountId
                      : item.scheduled.accountId,
                ),
                task:
                  item.kind === 'thread'
                    ? tasks.data?.items.find((task) => task.threadId === item.thread.id)
                    : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

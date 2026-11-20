import type { Task } from '@relay/shared';
import { useMemo } from 'react';
import { useTasks, useUserSettings } from '../../data/hooks/use-mail-queries';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { itemAccountId, type ListItem } from '../mail/list-items';
import { useAccountsModel } from '../mail/use-accounts-model';
import { timeLabelOf } from './grouping';
import type { RowContext } from './ListRow';

export type RowContextOf = (item: ListItem, now: Date) => RowContext;

export const useRowContext = (): RowContextOf => {
  const folder = useUiStore((state) => state.folder);
  const query = useUiStore((state) => state.query);
  const model = useAccountsModel();
  const settings = useUserSettings();
  const tasks = useTasks();
  const view = viewOf(folder);
  const oneLiners = settings.data?.ai.features.oneLiners ?? true;
  const taskOf = useMemo(() => {
    const byThread = new Map<string, Task>();
    (tasks.data?.items ?? []).forEach((task) => {
      if (task.threadId !== null && !byThread.has(task.threadId)) {
        byThread.set(task.threadId, task);
      }
    });
    return byThread;
  }, [tasks.data]);
  return (item, now) => ({
    view,
    query,
    unified: model.unified,
    oneLiners,
    time: timeLabelOf(item, view, now),
    account: model.byId.get(itemAccountId(item)),
    task: item.kind === 'thread' ? taskOf.get(item.thread.id) : undefined,
  });
};

import type { Task, ThreadSummary } from '@relay/shared';
import { useMemo } from 'react';
import { useTasks, useUserSettings } from '../../data/hooks/use-mail-queries';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { itemAccountId, type ListItem } from '../mail/list-items';
import { useAccountsModel } from '../mail/use-accounts-model';
import { threadPriority } from '../tasks/thread-priorities';
import { usePendingPriorities } from '../tasks/use-pending-priorities';
import { timeLabelOf } from './grouping';
import type { RowContext } from './ListRow';

export type RowContextOf = (item: ListItem, now: Date) => RowContext;

export const useRowContext = (): RowContextOf => {
  const folder = useUiStore((state) => state.folder);
  const query = useUiStore((state) => state.query);
  const model = useAccountsModel();
  const settings = useUserSettings();
  const tasks = useTasks();
  const pending = usePendingPriorities();
  const view = viewOf(folder);
  const oneLiners = settings.data?.ai.features.oneLiners ?? true;
  const taskOf = useMemo(() => {
    const byThread = new Map<string, Task>();
    const byId = new Map<string, Task>();
    (tasks.data?.items ?? []).forEach((task) => {
      byId.set(task.id, task);
      if (task.threadId !== null && !byThread.has(task.threadId)) {
        byThread.set(task.threadId, task);
      }
    });
    return (thread: ThreadSummary): Task | undefined => {
      const active = thread.activeTask;
      if (active === undefined || active === null) {
        return byThread.get(thread.id);
      }
      return byId.get(active.id);
    };
  }, [tasks.data]);
  return (item, now) => ({
    view,
    query,
    unified: model.unified,
    oneLiners,
    time: timeLabelOf(item, view, now),
    account: model.byId.get(itemAccountId(item)),
    task: item.kind === 'thread' ? taskOf(item.thread) : undefined,
    priority:
      view === 'tasks' && item.kind === 'thread' ? threadPriority(item.thread, pending) : undefined,
  });
};

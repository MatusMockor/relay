import { useUserSettings } from '../../data/hooks/use-mail-queries';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { itemAccountId, type ListItem } from '../mail/list-items';
import { useAccountsModel } from '../mail/use-accounts-model';
import { useThreadTaskIndex } from '../tasks/use-thread-task-index';
import { timeLabelOf } from './grouping';
import type { RowContext } from './ListRow';

export type RowContextOf = (item: ListItem, now: Date) => RowContext;

export const useRowContext = (): RowContextOf => {
  const folder = useUiStore((state) => state.folder);
  const query = useUiStore((state) => state.query);
  const model = useAccountsModel();
  const settings = useUserSettings();
  const taskOf = useThreadTaskIndex();
  const view = viewOf(folder);
  const oneLiners = settings.data?.ai.features.oneLiners ?? true;
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

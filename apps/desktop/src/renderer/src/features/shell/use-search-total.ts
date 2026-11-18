import { useThreadList } from '../../data/hooks/use-mail-queries';
import { listParamsOf, usesThreadList } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';

export const useSearchTotal = (): number | null => {
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const query = useUiStore((state) => state.query);
  const searching = query.trim() !== '' && usesThreadList(folder);
  const threads = useThreadList(listParamsOf(folder, scope, query), searching);
  if (!searching || threads.data === undefined || threads.isPlaceholderData) {
    return null;
  }
  return threads.data.nextCursor === null ? threads.data.items.length : null;
};

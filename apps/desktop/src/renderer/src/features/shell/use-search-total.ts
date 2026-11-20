import { useThreadList } from '../../data/hooks/use-mail-queries';
import { usesThreadList } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useListParams } from '../mail/use-list-params';

export const useSearchTotal = (): number | null => {
  const folder = useUiStore((state) => state.folder);
  const query = useUiStore((state) => state.query);
  const searching = query.trim() !== '' && usesThreadList(folder);
  const threads = useThreadList(useListParams(), searching);
  if (!searching || threads.data === undefined || threads.isPlaceholderData) {
    return null;
  }
  return threads.data.nextCursor === null ? threads.data.items.length : null;
};

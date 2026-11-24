import {
  isKeepSplitInput,
  isUnsupportedSplit,
  type SplitEntry,
  type SplitInput,
  type SplitReplaceItem,
} from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const withKeptUnsupportedSplits = (
  inputs: readonly SplitInput[],
  entries: readonly SplitEntry[] | undefined,
): SplitReplaceItem[] => {
  const items: SplitReplaceItem[] = [...inputs];
  [...(entries ?? [])]
    .sort((left, right) => left.order - right.order)
    .forEach((entry, index) => {
      if (!isUnsupportedSplit(entry)) {
        return;
      }
      items.splice(Math.min(index, items.length), 0, { id: entry.id, keep: true });
    });
  return items.map((item, order) => (isKeepSplitInput(item) ? item : { ...item, order }));
};

export const useReplaceSplits = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (splits: SplitInput[]) =>
      client.replaceSplits(
        withKeptUnsupportedSplits(
          splits,
          queryClient.getQueryData<SplitEntry[]>(queryKeys.splits()),
        ),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.splits(), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      void queryClient.invalidateQueries({ queryKey: ['mail', 'split-preview'] });
    },
  });
};

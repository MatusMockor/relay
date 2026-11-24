import type { SplitEntry, SplitInput } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { useReplaceSplits } from '../../data/hooks/use-replace-splits';
import { showToast } from '../../state/toast-store';

export type FilingBuilder = (entries: readonly SplitEntry[]) => SplitInput[] | string;

export type FiledHandler = (stored: readonly SplitEntry[], before: readonly SplitEntry[]) => void;

export interface FileToSplit {
  readonly busy: boolean;
  file(build: FilingBuilder, done: string, onFiled: FiledHandler): void;
}

export const useFileToSplit = (): FileToSplit => {
  const client = useClient();
  const queryClient = useQueryClient();
  const replace = useReplaceSplits();
  const submitting = useRef(false);
  const [working, setWorking] = useState(false);
  const run = async (build: FilingBuilder, done: string, onFiled: FiledHandler) => {
    const before = await queryClient.fetchQuery({
      queryKey: queryKeys.splits(),
      queryFn: () => client.listSplits(),
      staleTime: 0,
    });
    const inputs = build(before);
    if (typeof inputs === 'string') {
      showToast(inputs);
      return;
    }
    const stored = await replace.mutateAsync(inputs);
    onFiled(stored, before);
    showToast(done);
  };
  return {
    busy: working || replace.isPending,
    file: (build, done, onFiled) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      setWorking(true);
      run(build, done, onFiled)
        .catch((error: unknown) => {
          showToast(describeError(error));
        })
        .finally(() => {
          submitting.current = false;
          setWorking(false);
        });
    },
  };
};

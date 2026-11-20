import type { SplitEntry, SplitInput } from '@relay/shared';
import { useRef } from 'react';
import { describeError } from '../../data/errors';
import { useReplaceSplits } from '../../data/hooks/use-replace-splits';
import { showToast } from '../../state/toast-store';

export interface FileToSplit {
  readonly busy: boolean;
  file(inputs: SplitInput[], done: string, onFiled: (stored: SplitEntry[]) => void): void;
}

export const useFileToSplit = (): FileToSplit => {
  const replace = useReplaceSplits();
  const submitting = useRef(false);
  return {
    busy: replace.isPending,
    file: (inputs, done, onFiled) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      void replace
        .mutateAsync(inputs)
        .then(
          (stored) => {
            onFiled(stored);
            showToast(done);
          },
          (error: unknown) => {
            showToast(describeError(error));
          },
        )
        .finally(() => {
          submitting.current = false;
        });
    },
  };
};

import type { LabelId, ThreadSummary } from '@relay/shared';
import { describeError } from '../../data/errors';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { showToast } from '../../state/toast-store';

export type LabelToggle = (thread: ThreadSummary, labelId: LabelId, on: boolean) => void;

export const useLabelToggle = (): LabelToggle => {
  const mutation = useThreadAction((error) => {
    showToast(describeError(error));
  });
  return (thread, labelId, on) => {
    mutation.mutate({
      threadId: thread.id,
      action: on ? { type: 'addLabel', labelId } : { type: 'removeLabel', labelId },
    });
  };
};

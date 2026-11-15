import type { AiOutput } from '@relay/shared/domain';
import type { ChecklistItemChange } from '../../ports/ai-result-repository';

export const applyChecklistChange = (
  output: AiOutput,
  change: ChecklistItemChange,
): AiOutput | null => {
  if (output.kind !== 'summary' || !output.checklist.some((item) => item.id === change.itemId)) {
    return null;
  }
  return {
    ...output,
    checklist: output.checklist.map((item) =>
      item.id === change.itemId ? { ...item, done: change.done } : item,
    ),
  };
};

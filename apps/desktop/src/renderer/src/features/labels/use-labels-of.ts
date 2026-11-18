import type { Label, LabelId } from '@relay/shared';
import { useLabels } from '../../data/hooks/use-mail-queries';

export const useLabelsOf = (labelIds: readonly LabelId[]): Label[] => {
  const labels = useLabels().data ?? [];
  return labelIds.flatMap((id) => labels.filter((label) => label.id === id));
};

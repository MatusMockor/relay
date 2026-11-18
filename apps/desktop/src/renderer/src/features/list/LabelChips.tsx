import type { LabelId } from '@relay/shared';
import { LabelChip } from '../labels/LabelChip';
import { useLabelColor } from '../labels/use-label-color';
import { useLabelsOf } from '../labels/use-labels-of';

export const MAX_ROW_LABELS = 3;

export function LabelChips({ labelIds }: { readonly labelIds: readonly LabelId[] }) {
  const labels = useLabelsOf(labelIds);
  const colorOf = useLabelColor();
  if (labels.length === 0) {
    return null;
  }
  const hidden = labels.slice(MAX_ROW_LABELS);
  return (
    <span className="lbl-chips">
      {labels.slice(0, MAX_ROW_LABELS).map((label) => (
        <LabelChip key={label.id} label={label} color={colorOf(label)} />
      ))}
      {hidden.length === 0 ? null : (
        <span className="chip lbl-more" title={hidden.map((label) => label.name).join(', ')}>
          {`+${String(hidden.length)}`}
        </span>
      )}
    </span>
  );
}

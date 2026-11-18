import type { Label } from '@relay/shared';
import { Icon } from '@relay/ui';

export interface LabelChipProps {
  readonly label: Label;
  readonly color: string;
  readonly onRemove?: () => void;
}

export function LabelChip({ label, color, onRemove }: LabelChipProps) {
  return (
    <span className="chip lbl-chip" title={label.name} style={{ ['--d' as string]: color }}>
      <span className="lbl-chip-dot" aria-hidden="true" />
      <span className="lbl-chip-n">{label.name}</span>
      {onRemove === undefined ? null : (
        <button
          type="button"
          className="lbl-chip-x"
          aria-label={`Odstrániť štítok ${label.name}`}
          onClick={onRemove}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}

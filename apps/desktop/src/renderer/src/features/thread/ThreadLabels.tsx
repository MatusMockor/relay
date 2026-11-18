import type { ThreadSummary } from '@relay/shared';
import { Icon } from '@relay/ui';
import { setUi } from '../../state/ui-store';
import { LabelChip } from '../labels/LabelChip';
import { useLabelColor } from '../labels/use-label-color';
import { useLabelToggle } from '../labels/use-label-toggle';
import { useLabelsOf } from '../labels/use-labels-of';

export function ThreadLabels({ thread }: { readonly thread: ThreadSummary }) {
  const labels = useLabelsOf(thread.labelIds);
  const colorOf = useLabelColor();
  const toggle = useLabelToggle();
  return (
    <div className="t-labels" role="group" aria-label="Štítky">
      {labels.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          color={colorOf(label)}
          onRemove={() => {
            toggle(thread, label.id, false);
          }}
        />
      ))}
      <button
        type="button"
        className="chip lbl-add"
        title="Štítok (L)"
        aria-label="Pridať štítok"
        onClick={() => {
          setUi({ overlay: { kind: 'labels', threadId: thread.id } });
        }}
      >
        <Icon name="plus" size={11} />
        {labels.length === 0 ? 'Štítok' : null}
      </button>
    </div>
  );
}

import type { AccountId, LabelId } from '@relay/shared';
import { useLabels } from '../../../data/hooks/use-mail-queries';
import { OptionList } from './OptionList';

export interface LabelActionPickerProps {
  readonly accountId: AccountId;
  readonly taken: readonly LabelId[];
  readonly current: LabelId | null;
  readonly onPick: (labelId: LabelId) => void;
}

export function LabelActionPicker({ accountId, taken, current, onPick }: LabelActionPickerProps) {
  const labels = useLabels();
  if (labels.data === undefined) {
    return <p className="au-hint">Načítavam štítky…</p>;
  }
  const available = labels.data
    .filter((label) => label.accountId === accountId)
    .filter((label) => label.id === current || !taken.includes(label.id))
    .sort((left, right) => left.name.localeCompare(right.name, 'sk'));
  if (available.length === 0) {
    return <p className="au-hint">Na tomto účte nie sú žiadne voľné štítky.</p>;
  }
  return (
    <OptionList
      title="Pridať štítok"
      options={available.map((label) => ({
        key: label.id,
        label: label.name,
        checked: label.id === current,
        pick: () => {
          onPick(label.id);
        },
      }))}
    />
  );
}

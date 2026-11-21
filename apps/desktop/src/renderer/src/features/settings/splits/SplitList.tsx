import type { MailAccount, Split, UnsupportedSplit } from '@relay/shared';
import { useNameColors } from '../../colors/use-name-colors';
import { useRowDrag } from '../automations/use-row-drag';
import { SplitListRow } from './SplitListRow';
import { UnsupportedSplitRow } from './UnsupportedSplitRow';

export interface SplitListProps {
  readonly splits: readonly Split[];
  readonly unsupported: readonly UnsupportedSplit[];
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onOpen: (splitId: Split['id']) => void;
  readonly onMove: (from: number, to: number) => void;
}

export function SplitList({
  splits,
  unsupported,
  accounts,
  disabled,
  onOpen,
  onMove,
}: SplitListProps) {
  const colors = useNameColors();
  const drag = useRowDrag({ keys: splits.map((split) => split.id), disabled, onMove });
  return (
    <ul className="au-list" role="list" aria-label="Splity">
      {splits.map((split, index) => (
        <SplitListRow
          key={split.id}
          split={split}
          accounts={accounts}
          color={colors.of(split.name)}
          place={drag.place(index)}
          focusHandle={drag.moved === split.id}
          handle={drag.handle(index)}
          target={drag.target(index)}
          onOpen={() => {
            onOpen(split.id);
          }}
        />
      ))}
      {unsupported.map((split) => (
        <UnsupportedSplitRow key={split.id} split={split} accounts={accounts} />
      ))}
    </ul>
  );
}

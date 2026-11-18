import { Icon } from '@relay/ui';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { MAIN_TAB_LABEL, VIEW_META } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { useMailActions } from '../mail/MailActionsProvider';
import { backToList } from '../mail/navigation';
import { RowActions } from './RowActions';
import { useStepThread } from './use-step-thread';

const useFolderLabel = (): string => {
  const folder = useUiStore((state) => state.folder);
  const splits = useSplits();
  const labels = useLabels();
  if (folder.kind === 'view') {
    return VIEW_META[folder.view].label;
  }
  if (folder.kind === 'label') {
    return labels.data?.find((label) => label.id === folder.labelId)?.name ?? 'Štítok';
  }
  return folder.splitId === null
    ? MAIN_TAB_LABEL
    : (splits.data?.find((split) => split.id === folder.splitId)?.name ?? MAIN_TAB_LABEL);
};

export function ThreadNav() {
  const { items, current } = useMailActions();
  const openThreadId = useUiStore((state) => state.openThreadId);
  const step = useStepThread();
  const label = useFolderLabel();
  const index = items.findIndex((item) => item.key === openThreadId);
  const atFirst = index === 0;
  const atLast = index === items.length - 1;
  return (
    <div className="t-nav">
      <button type="button" className="t-back" title="Späť do zoznamu (Esc)" onClick={backToList}>
        <Icon name="back" size={16} />
        <span>{label}</span>
      </button>
      {current === null ? null : (
        <span className="t-acts">
          <RowActions item={current} inRow={false} />
        </span>
      )}
      {index < 0 ? null : (
        <span className="t-pos">
          <span>{`${String(index + 1)} z ${String(items.length)}`}</span>
          <button
            type="button"
            className="act"
            title="Predchádzajúca (K)"
            aria-label="Predchádzajúca"
            aria-disabled={atFirst || undefined}
            onClick={() => {
              if (atFirst) {
                return;
              }
              step(-1);
            }}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="act"
            title="Ďalšia (J)"
            aria-label="Ďalšia"
            aria-disabled={atLast || undefined}
            onClick={() => {
              if (atLast) {
                return;
              }
              step(1);
            }}
          >
            <Icon name="down" />
          </button>
        </span>
      )}
    </div>
  );
}

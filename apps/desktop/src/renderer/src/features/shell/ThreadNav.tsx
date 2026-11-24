import { Icon, TooltipButton } from '@relay/ui';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { useFolderMailbox } from '../folders/use-folder-mailbox';
import { MAIN_TAB_LABEL, VIEW_META } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { useTaskSystemConnections } from '../../data/hooks/use-task-systems';
import { useMailActions } from '../mail/MailActionsProvider';
import { backToList } from '../mail/navigation';
import { RowActions } from './RowActions';
import { useStepThread } from './use-step-thread';

const useFolderLabel = (): string => {
  const folder = useUiStore((state) => state.folder);
  const splits = useSplits();
  const labels = useLabels();
  const mailbox = useFolderMailbox(folder);
  const connections = useTaskSystemConnections();
  if (folder.kind === 'view') {
    return VIEW_META[folder.view].label;
  }
  if (folder.kind === 'label') {
    return labels.data?.find((label) => label.id === folder.labelId)?.name ?? 'Štítok';
  }
  if (folder.kind === 'mailbox') {
    return mailbox?.name ?? 'Priečinok';
  }
  if (folder.kind === 'taskSystem') {
    const connection = connections.data?.find((item) => item.id === folder.connectionId);
    return connection?.label ?? 'Task systém';
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
      <TooltipButton
        className="t-back"
        tip="Späť do zoznamu"
        shortcut={['Esc']}
        onClick={backToList}
      >
        <Icon name="back" size={16} />
        <span>{label}</span>
      </TooltipButton>
      {current === null ? null : (
        <span className="t-acts">
          <RowActions item={current} inRow={false} />
        </span>
      )}
      {index < 0 ? null : (
        <span className="t-pos">
          <span>{`${String(index + 1)} z ${String(items.length)}`}</span>
          <TooltipButton
            className="act"
            tip="Predchádzajúca"
            shortcut={['K']}
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
          </TooltipButton>
          <TooltipButton
            className="act"
            tip="Ďalšia"
            shortcut={['J']}
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
          </TooltipButton>
        </span>
      )}
    </div>
  );
}

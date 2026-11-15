import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { openThread } from '../mail/navigation';

export const useStepThread = () => {
  const { items } = useMailActions();
  return (delta: number) => {
    const open = useUiStore.getState().openThreadId;
    const index = items.findIndex((item) => item.key === open);
    const target = index < 0 ? items[0] : items[index + delta];
    if (target === undefined) {
      showToast(delta > 0 ? 'Toto je posledná konverzácia' : 'Toto je prvá konverzácia');
      return;
    }
    if (target.kind === 'thread') {
      openThread(target.thread.id);
    }
  };
};

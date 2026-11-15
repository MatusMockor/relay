import { useQueryClient } from '@tanstack/react-query';
import type { ThreadDetail } from '@relay/shared';
import { queryKeys } from '../../data/hooks/query-keys';
import { findCachedThread } from '../../data/hooks/thread-cache';
import { showToast } from '../../state/toast-store';
import { setUi, useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { remindPresets } from './presets';
import { WhenPicker } from './WhenPicker';

export function ReminderHost() {
  const overlay = useUiStore((state) => state.overlay);
  const actions = useMailActions();
  const queryClient = useQueryClient();
  if (overlay?.kind !== 'remind') {
    return null;
  }
  const thread =
    findCachedThread(queryClient, overlay.threadId) ??
    queryClient.getQueryData<ThreadDetail>(queryKeys.thread(overlay.threadId))?.thread ??
    null;
  const close = () => {
    setUi({ overlay: null });
  };
  return (
    <WhenPicker
      anchor={overlay.anchor}
      title="Pripomenúť"
      presets={remindPresets(new Date())}
      now={new Date()}
      onClose={close}
      onPick={(date) => {
        if (thread === null) {
          showToast('Konverzácia sa nenašla');
          return;
        }
        if (thread.state !== 'inbox' && thread.state !== 'reminder') {
          showToast('Pripomenúť sa dá len mail z Doručenej pošty');
          return;
        }
        actions.thread.remind(thread, date);
      }}
    />
  );
}

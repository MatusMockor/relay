import type { ThreadDetail } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { findCachedThread } from '../../data/hooks/thread-cache';
import { useLabels, useMailboxes } from '../../data/hooks/use-mail-queries';
import { setUi, useUiStore } from '../../state/ui-store';
import { useMailActions } from './MailActionsProvider';
import { moveTargetsOf } from './move-targets';
import { MovePicker } from './MovePicker';

export function MoveHost() {
  const overlay = useUiStore((state) => state.overlay);
  const actions = useMailActions();
  const queryClient = useQueryClient();
  const threadId = overlay?.kind === 'move' ? overlay.threadId : null;
  const thread =
    threadId === null
      ? null
      : (findCachedThread(queryClient, threadId) ??
        queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId))?.thread ??
        null);
  const mailboxes = useMailboxes(thread?.accountId ?? null);
  const labels = useLabels();
  if (thread === null) {
    return null;
  }
  const labelOf = (path: string) =>
    labels.data?.find(
      (label) =>
        label.accountId === thread.accountId && label.kind === 'gmail' && label.remoteName === path,
    )?.id;
  return (
    <MovePicker
      targets={moveTargetsOf(mailboxes.data ?? [])}
      loading={mailboxes.isPending}
      onClose={() => {
        setUi({ overlay: null });
      }}
      onPick={(target) => {
        const labelId = target.kind === 'label' ? labelOf(target.mailbox.path) : undefined;
        actions.thread.moveTo(thread, target, labelId);
      }}
    />
  );
}

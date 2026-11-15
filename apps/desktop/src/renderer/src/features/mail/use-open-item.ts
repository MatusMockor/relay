import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { setUi } from '../../state/ui-store';
import type { ListItem } from './list-items';
import { useMailActions } from './MailActionsProvider';
import { openThread } from './navigation';

export const useOpenItem = () => {
  const actions = useMailActions();
  const client = useClient();
  const queryClient = useQueryClient();
  return (item: ListItem | null) => {
    if (item === null) {
      return;
    }
    if (item.kind === 'thread') {
      openThread(item.thread.id);
      actions.thread.markRead(item.thread);
      return;
    }
    const draft = item.kind === 'draft' ? item.draft : item.draft;
    if (draft === null) {
      return;
    }
    if (item.kind === 'scheduled') {
      void client
        .cancelScheduled(item.scheduled.id)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.scheduled() }));
      showToast('Odoslanie pozastavené, správa je zatiaľ v Konceptoch');
    }
    if (draft.inReplyToThreadId !== null) {
      actions.compose.startReply(draft.inReplyToThreadId, draft.accountId, draft.body);
      setUi((state) => ({
        reply: state.reply === null ? null : { ...state.reply, draftId: draft.id },
      }));
      return;
    }
    const to = draft.to[0];
    setUi({
      overlay: {
        kind: 'compose',
        init: {
          draftId: draft.id,
          toEmail: to?.email,
          toName: to?.name ?? null,
          subject: draft.subject,
          body: draft.body,
          accountId: draft.accountId,
        },
      },
    });
  };
};

import type { Draft } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
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
  const openDraft = (draft: Draft) => {
    const simpleReply =
      draft.to.length <= 1 &&
      draft.cc.length === 0 &&
      draft.bcc.length === 0 &&
      draft.attachments.length === 0;
    if (draft.inReplyToThreadId !== null && simpleReply) {
      actions.compose.startReply(draft.inReplyToThreadId, draft.accountId, draft.body);
      setUi((state) => ({
        reply: state.reply === null ? null : { ...state.reply, draftId: draft.id },
      }));
      return;
    }
    setUi({
      overlay: {
        kind: 'compose',
        init: {
          draftId: draft.id,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          body: draft.body,
          accountId: draft.accountId,
          inReplyToThreadId: draft.inReplyToThreadId ?? undefined,
          inReplyToMessageId: draft.inReplyToMessageId ?? undefined,
        },
      },
    });
  };
  return (item: ListItem | null) => {
    if (item === null) {
      return;
    }
    if (item.kind === 'thread') {
      openThread(item.thread.id);
      actions.thread.markRead(item.thread);
      return;
    }
    const draft = item.draft;
    if (draft === null) {
      return;
    }
    if (item.kind === 'draft') {
      openDraft(draft);
      return;
    }
    void client.cancelScheduled(item.scheduled.id).then(
      () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.scheduled() });
        showToast('Odoslanie pozastavené, správa je zatiaľ v Konceptoch');
        openDraft(draft);
      },
      (error: unknown) => {
        showToast(`Odoslanie sa nepodarilo pozastaviť: ${describeError(error)}`);
      },
    );
  };
};

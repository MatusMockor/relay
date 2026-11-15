import type {
  AccountId,
  DraftContent,
  DraftId,
  MailAccount,
  ThreadDetail,
  ThreadId,
} from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { describeWhen } from '../../lib/dates';
import { showToast } from '../../state/toast-store';
import { type ComposeInit, setUi, useUiStore } from '../../state/ui-store';
import type { ListItem } from './list-items';
import { backToList, openThread } from './navigation';
import { buildReplyDraft } from './reply-draft';
import { neighborOf } from './selection';
import { deliver, keepAsDraft } from './deliver';
import { sendQueue } from './send-queue';

export const DEFAULT_UNDO_SEND_MS = 5_000;

export interface ReplySendInput {
  readonly detail: ThreadDetail;
  readonly text: string;
  readonly account: MailAccount;
  readonly accounts: readonly MailAccount[];
  readonly draftId: string | null;
}

export const useComposeCommands = (items: readonly ListItem[]) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const undoMs = useAppContext().undoSendMs ?? DEFAULT_UNDO_SEND_MS;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.drafts() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduled() });
  };
  const fail = (content: DraftContent, draftId: string | null) => async (error: unknown) => {
    const kept = await keepAsDraft(client, content, draftId).then(
      () => true,
      () => false,
    );
    refresh();
    showToast(
      `Odoslanie zlyhalo: ${describeError(error)}${kept ? '. Správa ostala v Konceptoch.' : ''}`,
    );
  };
  const startReply = (threadId: ThreadId, accountId: AccountId, text?: string) => {
    const draft = (
      queryClient.getQueryData<{ id: string; inReplyToThreadId: string | null; body: string }[]>(
        queryKeys.drafts(),
      ) ?? []
    ).find((item) => item.inReplyToThreadId === threadId);
    openThread(threadId);
    setUi({
      reply: {
        threadId,
        accountId,
        text: text ?? draft?.body ?? '',
        draftId: draft?.id ?? null,
        aiOpen: false,
        busy: false,
      },
    });
  };
  const saveReplyDraft = async (
    detail: ThreadDetail,
    account: MailAccount,
    accounts: readonly MailAccount[],
  ) => {
    const reply = useUiStore.getState().reply;
    setUi({ reply: null });
    if (reply === null) {
      return;
    }
    if (reply.text.trim() === '') {
      if (reply.draftId !== null) {
        await client.deleteDraft(reply.draftId as DraftId);
        refresh();
      }
      return;
    }
    const content = buildReplyDraft(detail, reply.text, account, accounts);
    await (reply.draftId === null
      ? client.createDraft(content)
      : client.updateDraft(reply.draftId as DraftId, content));
    refresh();
    showToast('Koncept uložený');
  };
  const sendReply = ({ detail, text, account, accounts, draftId }: ReplySendInput) => {
    const content = buildReplyDraft(detail, text, account, accounts);
    const threadId = detail.thread.id;
    const next = neighborOf(items, threadId);
    setUi({ reply: null });
    if (next?.kind === 'thread') {
      openThread(next.thread.id);
    }
    if (next?.kind !== 'thread') {
      backToList();
    }
    const pending = sendQueue.enqueue(undoMs, async () => {
      const sent = await deliver(client, content, draftId).then(() => true, fail(content, draftId));
      if (sent !== true) {
        return;
      }
      await client.applyThreadAction(threadId, { type: 'done' }).catch(() => undefined);
      refresh();
    });
    const via = accounts.length > 1 ? ` z ${account.email}` : '';
    showToast(`Odoslané${via}`, {
      undoMs,
      undo: () => {
        if (!pending.cancel()) {
          return;
        }
        openThread(threadId);
        setUi({
          reply: { threadId, accountId: account.id, text, draftId, aiOpen: false, busy: false },
        });
      },
    });
  };
  const sendNew = (content: DraftContent, init: ComposeInit, scheduledAt: Date | null) => {
    const name = content.to[0]?.name ?? content.to[0]?.email ?? '';
    if (scheduledAt !== null) {
      void deliver(client, content, init.draftId ?? null, scheduledAt)
        .then((result) => {
          refresh();
          showToast(`Odošle sa ${describeWhen(scheduledAt, new Date()).phrase}`, {
            undo: () => {
              if (result.status === 'scheduled') {
                void client.cancelScheduled(result.scheduledSend.id).then(refresh);
              }
            },
          });
        })
        .catch(fail(content, init.draftId ?? null));
      return;
    }
    const pending = sendQueue.enqueue(undoMs, () =>
      deliver(client, content, init.draftId ?? null).then(
        refresh,
        fail(content, init.draftId ?? null),
      ),
    );
    showToast(`Odoslané ${name}`.trim(), {
      undoMs,
      undo: () => {
        if (pending.cancel()) {
          setUi({
            overlay: {
              kind: 'compose',
              init: {
                ...init,
                toEmail: content.to[0]?.email,
                toName: content.to[0]?.name ?? null,
                subject: content.subject,
                body: content.body,
                accountId: content.accountId,
              },
            },
          });
        }
      },
    });
  };
  return { startReply, saveReplyDraft, sendReply, sendNew };
};

export type ComposeCommands = ReturnType<typeof useComposeCommands>;

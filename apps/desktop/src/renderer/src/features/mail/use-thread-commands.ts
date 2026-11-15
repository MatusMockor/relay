import type { ThreadAction, ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { describeWhen } from '../../lib/dates';
import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';
import type { ListItem } from './list-items';
import { backToList, openThread } from './navigation';
import { neighborOf, selectKey } from './selection';

const retire = (items: readonly ListItem[], key: string): void => {
  const next = neighborOf(items, key);
  const open = useUiStore.getState().openThreadId;
  if (open === key) {
    if (next?.kind === 'thread') {
      openThread(next.thread.id);
      return;
    }
    backToList();
    return;
  }
  if (next !== null) {
    selectKey(next.key);
  }
};

const restoreMessage = (thread: ThreadSummary): string =>
  thread.state === 'trash' ? 'Obnovené do Doručenej pošty' : 'Vrátené do Doručenej pošty';

export const useThreadCommands = (items: readonly ListItem[]) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const mutation = useThreadAction((error) => {
    showToast(describeError(error));
  });
  const apply = (
    thread: ThreadSummary,
    action: ThreadAction,
    message: string,
    undo: ThreadAction,
  ) => {
    retire(items, thread.id);
    mutation.mutate({ threadId: thread.id, action });
    showToast(message, {
      undo: () => {
        mutation.mutate({ threadId: thread.id, action: undo });
      },
    });
  };
  const markDone = (item: ListItem | null) => {
    if (item?.kind !== 'thread') {
      return;
    }
    const { thread } = item;
    if (thread.state === 'done' || thread.state === 'trash') {
      apply(
        thread,
        { type: thread.state === 'done' ? 'undone' : 'restore' },
        restoreMessage(thread),
        { type: thread.state === 'done' ? 'done' : 'trash' },
      );
      return;
    }
    apply(thread, { type: 'done' }, 'Hotovo', { type: 'undone' });
  };
  const remind = (thread: ThreadSummary, at: Date) => {
    apply(
      thread,
      { type: 'remind', at: at.toISOString() },
      `Pripomenie sa ${describeWhen(at, new Date()).phrase}`,
      { type: 'cancelReminder' },
    );
  };
  const trashDraft = async (item: Extract<ListItem, { kind: 'draft' }>) => {
    retire(items, item.key);
    await client.deleteDraft(item.draft.id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.drafts() });
    showToast('Koncept zahodený', {
      undo: () => {
        void client
          .createDraft(item.draft)
          .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.drafts() }));
      },
    });
  };
  const cancelScheduled = async (item: Extract<ListItem, { kind: 'scheduled' }>) => {
    retire(items, item.key);
    await client.cancelScheduled(item.scheduled.id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduled() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.drafts() });
    showToast('Plán zrušený, správa je v Konceptoch');
  };
  const trash = (item: ListItem | null) => {
    if (item === null) {
      return;
    }
    if (item.kind === 'draft') {
      void trashDraft(item).catch((error: unknown) => {
        showToast(describeError(error));
      });
      return;
    }
    if (item.kind === 'scheduled') {
      void cancelScheduled(item).catch((error: unknown) => {
        showToast(describeError(error));
      });
      return;
    }
    if (item.thread.state === 'trash') {
      showToast('Už je v koši');
      return;
    }
    apply(item.thread, { type: 'trash' }, 'Presunuté do koša', { type: 'restore' });
  };
  const markRead = (thread: ThreadSummary) => {
    if (!thread.unread) {
      return;
    }
    mutation.mutate({ threadId: thread.id, action: { type: 'markRead' } });
  };
  return { markDone, remind, trash, markRead };
};

export type ThreadCommands = ReturnType<typeof useThreadCommands>;

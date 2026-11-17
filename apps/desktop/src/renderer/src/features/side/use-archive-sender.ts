import type { SplitId, ThreadSummary } from '@relay/shared';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import type { MailClient } from '../../data/MailClient';
import { useClient } from '../../data/hooks/services-context';
import { LIST_LIMIT } from '../../data/hooks/use-mail-queries';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { plural } from '../../lib/text';
import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';
import { backToList } from '../mail/navigation';

const BATCH_SIZE = 10;

export const threadCount = (count: number): string =>
  `${String(count)} ${plural(count, 'vlákno', 'vlákna', 'vlákien')}`;

const collectView = async (
  client: MailClient,
  splitId: SplitId | undefined,
  matches: (thread: ThreadSummary) => boolean,
): Promise<ThreadSummary[]> => {
  const found: ThreadSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listThreads({ view: 'inbox', limit: LIST_LIMIT, splitId, cursor });
    found.push(...page.items.filter(matches));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return found;
};

const collectInbox = async (
  client: MailClient,
  matches: (thread: ThreadSummary) => boolean,
): Promise<ThreadSummary[]> => {
  const exclusive = (await client.listSplits()).filter((split) => split.exclusive);
  const views = [undefined, ...exclusive.map((split) => split.id)];
  const pages = await Promise.all(views.map((splitId) => collectView(client, splitId, matches)));
  return [...new Map(pages.flat().map((thread) => [thread.id, thread])).values()];
};

const chunksOf = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) =>
    items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );

export const useArchiveSender = (matches: (thread: ThreadSummary) => boolean) => {
  const client = useClient();
  const mutation = useThreadAction();
  const [pending, setPending] = useState<readonly ThreadSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = async (threads: readonly ThreadSummary[], type: 'done' | 'undone') => {
    const archived: ThreadSummary[] = [];
    for (const chunk of chunksOf(threads)) {
      const results = await Promise.allSettled(
        chunk.map((thread) => mutation.mutateAsync({ threadId: thread.id, action: { type } })),
      );
      archived.push(...chunk.filter((_, index) => results[index]?.status === 'fulfilled'));
    }
    return archived;
  };
  const start = async () => {
    setBusy(true);
    try {
      const threads = await collectInbox(client, matches);
      if (threads.length === 0) {
        showToast('V Doručenej pošte nie je nič na archiváciu');
        return;
      }
      setPending(threads);
    } catch (error) {
      showToast(describeError(error));
    } finally {
      setBusy(false);
    }
  };
  const archive = async (threads: readonly ThreadSummary[]) => {
    setBusy(true);
    const open = useUiStore.getState().openThreadId;
    if (threads.some((thread) => thread.id === open)) {
      backToList();
    }
    const archived = await apply(threads, 'done');
    setBusy(false);
    const failed = threads.length - archived.length;
    const suffix = failed === 0 ? '' : `, ${threadCount(failed)} zlyhalo`;
    showToast(`Archivované: ${threadCount(archived.length)}${suffix}`, {
      undo: () => {
        void apply(archived, 'undone');
      },
    });
  };
  const confirm = () => {
    const threads = pending;
    setPending(null);
    if (threads !== null) {
      void archive(threads);
    }
  };
  const cancel = () => {
    setPending(null);
  };
  return { pending, busy, start, confirm, cancel };
};

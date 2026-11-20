import type { ThreadSummary } from '@relay/shared';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import type { MailClient } from '../../data/MailClient';
import { useClient } from '../../data/hooks/services-context';
import { scanThreads } from '../../data/hooks/thread-scan';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { plural } from '../../lib/text';
import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';
import { backToList } from '../mail/navigation';
import { inboxThreadsOf, senderInboxScans } from './sender-inbox-scans';

const BATCH_SIZE = 10;

export const threadCount = (count: number): string =>
  `${String(count)} ${plural(count, 'vlákno', 'vlákna', 'vlákien')}`;

const collectInbox = async (
  client: MailClient,
  matches: (thread: ThreadSummary) => boolean,
): Promise<ThreadSummary[]> => {
  const scans = senderInboxScans(await client.listSplits());
  const pages = await Promise.all(scans.map((params) => scanThreads(client, params)));
  return inboxThreadsOf(pages.flatMap((page) => page.items)).filter(matches);
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
  const apply = async (threads: readonly ThreadSummary[], type: 'archive' | 'undone') => {
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
    const archived = await apply(threads, 'archive');
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

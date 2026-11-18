import type { Split, ThreadSummary } from '@relay/shared';
import type { ThreadScanParams } from '../../data/hooks/thread-scan';

const hidesInboxTasks = (splits: readonly Split[]): boolean =>
  splits.some((split) => split.exclusive && split.hideTasks);

export const senderInboxScans = (splits: readonly Split[]): ThreadScanParams[] => [
  { view: 'inbox' },
  ...splits
    .filter((split) => split.exclusive)
    .map((split) => ({ view: 'inbox' as const, splitId: split.id })),
  ...(hidesInboxTasks(splits) ? [{ view: 'tasks' as const }] : []),
];

export const uniqueThreads = (threads: readonly ThreadSummary[]): ThreadSummary[] => [
  ...new Map(threads.map((thread) => [thread.id, thread])).values(),
];

export const inboxThreadsOf = (threads: readonly ThreadSummary[]): ThreadSummary[] =>
  uniqueThreads(threads.filter((thread) => thread.state === 'inbox'));

import type { ThreadSummary } from '@relay/shared';

export const keepActiveTask = (next: ThreadSummary, listed: ThreadSummary): ThreadSummary =>
  next.activeTask === undefined && listed.activeTask !== undefined
    ? { ...next, activeTask: listed.activeTask }
    : next;

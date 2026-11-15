import type { ThreadSummary } from '@relay/shared';

export const jiraActorOf = (thread: ThreadSummary): string | null =>
  thread.jiraKey === null ? null : thread.jiraActor;

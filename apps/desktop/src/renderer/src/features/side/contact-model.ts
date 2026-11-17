import type { Address, Task, ThreadId, ThreadSummary } from '@relay/shared';
import { jiraActorOf } from '../mail/jira-display';

export const OPEN_TASK_LIMIT = 3;
export const RECENT_LIMIT = 4;

export interface ContactKey {
  readonly email: string;
  readonly actor: string | null;
}

export const contactOf = (item: ThreadSummary, own: ReadonlySet<string>): Address | undefined =>
  item.participants.find((address) => !own.has(address.email.toLowerCase())) ??
  item.participants[0];

export const matchesContact = (
  item: ThreadSummary,
  key: ContactKey,
  own: ReadonlySet<string>,
): boolean =>
  key.actor === null
    ? contactOf(item, own)?.email.toLowerCase() === key.email.toLowerCase()
    : jiraActorOf(item) === key.actor;

const later = (a: string, b: string): number => Date.parse(b) - Date.parse(a);

export const newestFirst = (a: ThreadSummary, b: ThreadSummary): number =>
  later(a.lastMessageAt, b.lastMessageAt);

export const jiraTasksFor = (
  tasks: readonly Task[],
  threadId: ThreadId,
  related: readonly ThreadSummary[],
): Task[] =>
  tasks.filter(
    (task) =>
      task.jiraKey !== null &&
      (task.threadId === threadId || related.some((item) => item.jiraKey === task.jiraKey)),
  );

export const openTasksFor = (
  tasks: readonly Task[],
  threadIds: ReadonlySet<string>,
  shown: readonly Task[],
): Task[] =>
  tasks
    .filter(
      (task) =>
        task.state === 'open' &&
        task.threadId !== null &&
        threadIds.has(task.threadId) &&
        !shown.some((other) => other.id === task.id),
    )
    .sort((a, b) => later(a.createdAt, b.createdAt))
    .slice(0, OPEN_TASK_LIMIT);

export const mailCount = (threads: readonly ThreadSummary[]): number =>
  threads.reduce((total, item) => total + item.messageCount, 0);

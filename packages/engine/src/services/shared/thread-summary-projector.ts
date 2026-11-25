import type {
  AccountId,
  Address,
  JiraKey,
  LabelId,
  Message,
  SplitId,
  ThreadId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import { byDateAscending } from './dates';

export interface ThreadProjection {
  readonly threadId: ThreadId;
  readonly accountId: AccountId;
  readonly existing: ThreadSummary | null;
  readonly messages: readonly Message[];
  readonly splitIds?: readonly SplitId[];
  readonly addSplitIds?: readonly SplitId[];
  readonly jiraKey?: JiraKey | null;
  readonly jiraActor?: string | null;
  readonly state?: ThreadState;
}

const participantsOf = (messages: readonly Message[]): Address[] => {
  const byEmail = new Map<string, Address>();
  messages
    .flatMap((message) => [
      ...(message.from === null ? [] : [message.from]),
      ...message.to,
      ...message.cc,
    ])
    .forEach((address) => {
      const key = address.email.toLowerCase();
      const known = byEmail.get(key);
      if (known === undefined || (known.name === null && address.name !== null)) {
        byEmail.set(key, address);
      }
    });
  return [...byEmail.values()];
};

const union = <Item>(...lists: readonly (readonly Item[])[]): Item[] => [...new Set(lists.flat())];

export const projectThreadSummary = (projection: ThreadProjection): ThreadSummary | null => {
  const messages = [...projection.messages].sort(byDateAscending);
  const first = messages[0];
  const last = messages[messages.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const existing = projection.existing;
  const labelIds: LabelId[] = union(...projection.messages.map((message) => message.labelIds));
  return {
    id: projection.threadId,
    accountId: projection.accountId,
    subject: first.subject,
    participants: participantsOf(messages),
    lastMessageAt: last.date,
    messageCount: messages.length,
    unread: projection.messages.some((message) => !message.flags.seen),
    snippet: last.snippet,
    aiOneLiner: existing?.aiOneLiner ?? null,
    jiraKey: projection.jiraKey ?? existing?.jiraKey ?? null,
    jiraActor: projection.jiraActor ?? existing?.jiraActor ?? null,
    splitIds: union(projection.splitIds ?? existing?.splitIds ?? [], projection.addSplitIds ?? []),
    labelIds,
    state: projection.state ?? existing?.state ?? 'inbox',
    remindAt: existing?.remindAt ?? null,
    hasDraft: existing?.hasDraft ?? false,
  };
};

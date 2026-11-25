import type { BacklogPhase } from './backlog-phase';
import { conversationGroups } from './conversation-order';
import { entryKey } from './initial-chunk';
import type { MailboxWindow, WindowEntry } from './initial-window';
import { withoutOrphanReplies } from './subject-replies';

export interface BacklogPlan {
  readonly wanted: readonly WindowEntry[];
  readonly processed: ReadonlySet<string>;
  readonly carried: ReadonlySet<WindowEntry>;
  readonly held: number;
}

export const keyOf = (entry: WindowEntry): string => entryKey(entry.pass.mailbox.id, entry.uid);

const inInbox = (entry: WindowEntry): boolean => entry.pass.role === 'inbox';

export const planBacklog = (
  windows: readonly MailboxWindow[],
  done: ReadonlySet<string>,
  phase: BacklogPhase,
): BacklogPlan => {
  const pending = (entry: WindowEntry): boolean => entry.wanted && !done.has(keyOf(entry));
  const conversations = conversationGroups(windows, inInbox);
  const all = conversations.flat().filter(pending);
  const wanted = phase.holdSubjectReplies
    ? conversations
        .flatMap((conversation) => withoutOrphanReplies(conversation, pending))
        .filter(pending)
    : all;
  const { counted } = phase;
  const carried = counted === null ? [] : wanted.filter((e) => !counted.has(e.pass.mailbox.id));
  return {
    wanted,
    processed: new Set([...done, ...wanted.map(keyOf)]),
    carried: new Set(carried),
    held: all.length - wanted.length,
  };
};

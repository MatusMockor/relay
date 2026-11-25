import { normalizeSubject } from '../../subjects/normalize-subject';
import type { WindowEntry } from './initial-window';

export const subjectOnlyReply = (entry: WindowEntry): boolean =>
  entry.parentIds.length === 0 && normalizeSubject(entry.subject).hadReplyPrefix;

const linkedTo = (entry: WindowEntry, held: ReadonlySet<string>): boolean =>
  (entry.messageId !== null && held.has(entry.messageId)) ||
  entry.parentIds.some((id) => held.has(id));

export const withoutOrphanReplies = (
  conversation: readonly WindowEntry[],
  pending: (entry: WindowEntry) => boolean,
): WindowEntry[] => {
  const held = new Set<string>();
  let anchored = false;
  return conversation.filter((entry) => {
    if (!pending(entry)) {
      anchored = anchored || entry.wanted;
      return true;
    }
    if (!linkedTo(entry, held) && !(subjectOnlyReply(entry) && !anchored)) {
      anchored = true;
      return true;
    }
    if (entry.messageId !== null) {
      held.add(entry.messageId);
    }
    return false;
  });
};

import { type MailboxId, PENDING_UID } from '@relay/shared/domain';
import type { MergeMember, MergeVerdict } from '../../model/message-merge';

const spansThreads = (members: readonly MergeMember[]): boolean =>
  new Set(members.map((member) => member.threadId)).size > 1;

const hasMailboxConflict = (members: readonly MergeMember[]): boolean => {
  const seen = new Set<MailboxId>();
  return members
    .flatMap((member) => member.placements)
    .filter((placement) => placement.uid !== PENDING_UID)
    .some((placement) => {
      if (seen.has(placement.mailboxId)) {
        return true;
      }
      seen.add(placement.mailboxId);
      return false;
    });
};

export const verdictOf = (members: readonly MergeMember[]): MergeVerdict => {
  if (members.length < 2) {
    return 'single';
  }
  if (spansThreads(members)) {
    return 'spans-threads';
  }
  return hasMailboxConflict(members) ? 'mailbox-conflict' : 'merge';
};

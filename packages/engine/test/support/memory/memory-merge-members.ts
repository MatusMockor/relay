import type { AccountId, Message } from '@relay/shared/domain';
import type { MergeChunk, MergeGroup, MergeMember } from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { roleOfIn } from './memory-placements';

const byEmailId = (left: MergeGroup, right: MergeGroup): number => {
  if (left.emailId === right.emailId) {
    return 0;
  }
  return left.emailId < right.emailId ? -1 : 1;
};

export const nextGroupsIn = (
  db: MemoryDatabase,
  accountId: AccountId,
  after: string | null,
  maxMessages: number,
): MergeChunk => {
  const sizes = new Map<string, number>();
  db.tables.messages.forEach(({ accountId: owner, emailId }) => {
    if (owner !== accountId || emailId === null || (after !== null && emailId <= after)) {
      return;
    }
    sizes.set(emailId, (sizes.get(emailId) ?? 0) + 1);
  });
  const candidates = [...sizes.entries()]
    .map(([emailId, size]) => ({ emailId, size }))
    .filter((group) => group.size > 1)
    .sort(byEmailId);
  const groups: MergeGroup[] = [];
  let total = 0;
  for (const group of candidates) {
    if (groups.length > 0 && total + group.size > maxMessages) {
      break;
    }
    groups.push(group);
    total += group.size;
  }
  return { groups, last: groups.at(-1)?.emailId ?? null };
};

const memberOf = (db: MemoryDatabase, message: Message, order: number): MergeMember => {
  const roleOf = roleOfIn(db);
  const gates = db.tables.messageEffects.get(message.id);
  return {
    id: message.id,
    order,
    threadId: message.threadId,
    inInbox: message.placements.some((placement) => roleOf(placement.mailboxId) === 'inbox'),
    primary: { mailboxId: message.mailboxId, uid: message.uid },
    placements: message.placements,
    bodyState: message.bodyState ?? 'local',
    bodyLength: (message.textBody ?? '').length + (message.htmlBody ?? '').length,
    gates: { jiraEffectsAt: gates?.jira ?? null, inviteEffectsAt: gates?.invite ?? null },
  };
};

export const membersIn = (
  db: MemoryDatabase,
  accountId: AccountId,
  emailId: string,
): MergeMember[] =>
  [...db.tables.messages.values()].flatMap((message, order) =>
    message.accountId === accountId && message.emailId === emailId
      ? [memberOf(db, message, order)]
      : [],
  );

import type { AccountId, MailboxId, MessageId } from '@relay/shared/domain';
import {
  type EmailIdResolutions,
  type GroupMergePlan,
  type MergeChunk,
  type MergedGroup,
  type MergeGroup,
  type MergeReport,
  type MergeSkipReason,
  mergeMappingOf,
  messageIdRemapOf,
  type MessageMerges,
  planGroupMerge,
  type ResolvedEmailId,
  type UnresolvedPlacement,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { mergeIntoKeeper } from './memory-merge-keeper';
import { membersIn, nextGroupsIn } from './memory-merge-members';
import { overridesOf, remapPendingWorkIn } from './memory-merge-pending-work';
import { remapReferencesIn } from './memory-merge-references';

export class MemoryMessageMerges implements MessageMerges {
  failAfterRemap: string | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  nextGroups(accountId: AccountId, after: string | null, maxMessages: number) {
    return Promise.resolve<MergeChunk>(nextGroupsIn(this.db, accountId, after, maxMessages));
  }

  merge(accountId: AccountId, groups: readonly MergeGroup[]): Promise<MergeReport> {
    const skipped: Record<MergeSkipReason, number> = { 'spans-threads': 0, 'mailbox-conflict': 0 };
    const plans: GroupMergePlan[] = [];
    groups.forEach(({ emailId }) => {
      const decision = planGroupMerge(membersIn(this.db, accountId, emailId));
      if (decision.verdict === 'merge') {
        plans.push(decision.plan);
        return;
      }
      if (decision.verdict !== 'single') {
        skipped[decision.verdict] += 1;
      }
    });
    const mapping = mergeMappingOf(plans);
    remapPendingWorkIn(this.db, accountId, mapping);
    remapReferencesIn(this.db, messageIdRemapOf(mapping.keeperOf));
    if (this.failAfterRemap !== null && plans.length > 0) {
      return Promise.reject(new Error(this.failAfterRemap));
    }
    const merged = plans.flatMap((plan): MergedGroup[] => {
      const overrides = overridesOf(this.db, accountId, plan.keeper.id);
      const keeper = mergeIntoKeeper(this.db, plan, overrides);
      if (keeper === null || keeper.emailId === null) {
        return [];
      }
      const loserIds = plan.losers.map((loser) => loser.id);
      return [
        { emailId: keeper.emailId, keeperId: keeper.id, loserIds, threadId: keeper.threadId },
      ];
    });
    return Promise.resolve({ merged, skipped });
  }
}

export class MemoryEmailIdResolutions implements EmailIdResolutions {
  constructor(private readonly db: MemoryDatabase) {}

  listUnresolved(
    mailboxId: MailboxId,
    afterUid: number,
    limit: number,
  ): Promise<UnresolvedPlacement[]> {
    const unresolved = [...this.db.tables.messages.values()]
      .filter((message) => message.emailId === null)
      .flatMap((message) =>
        message.placements
          .filter((placement) => placement.mailboxId === mailboxId && placement.uid > afterUid)
          .map((placement) => ({ messageId: message.id, uid: placement.uid })),
      )
      .sort((left, right) => left.uid - right.uid);
    return Promise.resolve(unresolved.slice(0, limit));
  }

  fillEmailIds(mailboxId: MailboxId, resolved: readonly ResolvedEmailId[]): Promise<number> {
    const { messages } = this.db.tables;
    const filled = new Set<MessageId>();
    resolved.forEach(({ uid, emailId }) => {
      const message = [...messages.values()].find(
        (candidate) =>
          candidate.emailId === null &&
          candidate.placements.some(
            (placement) => placement.mailboxId === mailboxId && placement.uid === uid,
          ),
      );
      if (message === undefined) {
        return;
      }
      messages.set(message.id, { ...message, emailId });
      filled.add(message.id);
    });
    return Promise.resolve(filled.size);
  }
}

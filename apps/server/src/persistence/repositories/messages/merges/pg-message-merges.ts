import {
  type MergeChunk,
  type MergeGroup,
  type MergeReport,
  type MessageMerges,
  planGroupMerge,
} from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { DbExecutor } from '../../../database/database';
import { nextMergeGroups } from './merge-groups';
import { lockMergeGroups } from './merge-locks';
import { readMergeMembers } from './merge-members';
import { applyMergePlans } from './merge-pipeline';
import {
  type DecidedGroup,
  EMPTY_MERGE_REPORT,
  mergeReportOf,
  plannedGroups,
} from './merge-report';

export class PgMessageMerges implements MessageMerges {
  constructor(private readonly db: DbExecutor) {}

  nextGroups(accountId: AccountId, after: string | null, maxMessages: number): Promise<MergeChunk> {
    return nextMergeGroups(this.db, accountId, after, maxMessages);
  }

  merge(accountId: AccountId, groups: readonly MergeGroup[]): Promise<MergeReport> {
    const emailIds = [...new Set(groups.map((group) => group.emailId))];
    if (emailIds.length === 0) {
      return Promise.resolve(EMPTY_MERGE_REPORT);
    }
    return this.db.transaction(async (tx) => {
      await lockMergeGroups(tx, accountId, emailIds);
      const members = await readMergeMembers(tx, accountId, emailIds);
      const decided: DecidedGroup[] = emailIds.map((emailId) => ({
        emailId,
        decision: planGroupMerge(members.get(emailId) ?? []),
      }));
      const plans = plannedGroups(decided).map(({ plan }) => plan);
      if (plans.length > 0) {
        await applyMergePlans(tx, accountId, plans);
      }
      return mergeReportOf(decided);
    });
  }
}

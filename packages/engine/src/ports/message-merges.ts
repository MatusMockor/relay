import type { AccountId } from '@relay/shared/domain';
import type { MergeChunk, MergeGroup, MergeReport } from '../model/message-merge';

export interface MessageMerges {
  nextGroups(accountId: AccountId, after: string | null, maxMessages: number): Promise<MergeChunk>;
  merge(accountId: AccountId, groups: readonly MergeGroup[]): Promise<MergeReport>;
}

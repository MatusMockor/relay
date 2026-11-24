import type {
  MessageBodyState,
  MessageFlags,
  MessageId,
  MessagePlacement,
  ThreadId,
} from '@relay/shared/domain';
import type { PendingWork, PendingWorkKey } from './pending-work';

export interface MergeGroup {
  readonly emailId: string;
  readonly size: number;
}

export interface MergeChunk {
  readonly groups: readonly MergeGroup[];
  readonly last: string | null;
}

export type MergeSkipReason = 'spans-threads' | 'mailbox-conflict';

export type MergeVerdict = 'merge' | 'single' | MergeSkipReason;

export interface MergedGroup {
  readonly emailId: string;
  readonly keeperId: MessageId;
  readonly loserIds: readonly MessageId[];
  readonly threadId: ThreadId;
}

export interface MergeReport {
  readonly merged: readonly MergedGroup[];
  readonly skipped: Readonly<Record<MergeSkipReason, number>>;
}

export interface MergeGates {
  readonly jiraEffectsAt: string | null;
  readonly inviteEffectsAt: string | null;
}

export interface MergeMember {
  readonly id: MessageId;
  readonly order: number;
  readonly threadId: ThreadId;
  readonly inInbox: boolean;
  readonly primary: MessagePlacement;
  readonly placements: readonly MessagePlacement[];
  readonly bodyState: MessageBodyState;
  readonly bodyLength: number;
  readonly gates: MergeGates;
}

export type MergeMembers = readonly [MergeMember, ...MergeMember[]];

export interface OwnedPlacement {
  readonly messageId: MessageId;
  readonly placement: MessagePlacement;
}

export interface PlacementReduction {
  readonly kept: readonly OwnedPlacement[];
  readonly dropped: readonly OwnedPlacement[];
}

export interface GroupMergePlan {
  readonly keeper: MergeMember;
  readonly losers: readonly MergeMember[];
  readonly donor: MergeMember;
  readonly gates: MergeGates;
  readonly placements: PlacementReduction;
}

export type GroupMergeDecision =
  | { readonly verdict: 'merge'; readonly plan: GroupMergePlan }
  | { readonly verdict: Exclude<MergeVerdict, 'merge'> };

export interface MergeMapping {
  readonly keeperOf: ReadonlyMap<MessageId, MessageId>;
  readonly primaryOf: ReadonlyMap<MessageId, MessagePlacement>;
}

export interface PendingWorkRemap {
  readonly remove: readonly PendingWorkKey[];
  readonly write: readonly PendingWork[];
}

export type PendingFlagOverrides = Partial<Pick<MessageFlags, 'seen' | 'flagged'>>;

export interface PendingOverrides {
  readonly flags: PendingFlagOverrides;
  readonly labels: ReadonlyMap<string, boolean>;
}

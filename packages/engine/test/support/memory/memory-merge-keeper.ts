import type { AccountId, LabelId, Message, MessageId } from '@relay/shared/domain';
import {
  type GroupMergePlan,
  overlayFlags,
  overlayLabels,
  type PendingOverrides,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { storePlacements } from './memory-placement-writes';

const labelOfIn =
  (db: MemoryDatabase, accountId: AccountId) =>
  (remoteName: string): LabelId | undefined =>
    [...db.tables.labels.values()].find(
      (label) =>
        label.accountId === accountId && label.kind === 'gmail' && label.remoteName === remoteName,
    )?.id;

const withDonorContent = (db: MemoryDatabase, keeper: Message, donor: Message): Message => {
  if (donor.id === keeper.id) {
    return keeper;
  }
  const headers = db.tables.messageHeaders.get(donor.id);
  if (headers !== undefined) {
    db.tables.messageHeaders.set(keeper.id, headers);
  }
  const { bodyState: _bodyState, ...rest } = keeper;
  return {
    ...rest,
    ...(donor.bodyState === undefined ? {} : { bodyState: donor.bodyState }),
    textBody: donor.textBody,
    htmlBody: donor.htmlBody,
    snippet: donor.snippet,
    attachments: donor.attachments,
    messageIdHeader: keeper.messageIdHeader ?? donor.messageIdHeader,
  };
};

const aliasLosers = (db: MemoryDatabase, losers: readonly MessageId[], keeper: MessageId) => {
  const aliases = db.tables.messageAliases;
  const merged = new Set(losers);
  aliases.forEach((target, alias) => {
    if (merged.has(target)) {
      aliases.set(alias, keeper);
    }
  });
  losers.forEach((loser) => aliases.set(loser, keeper));
};

const deleteLosers = (db: MemoryDatabase, losers: readonly MessageId[]): void => {
  losers.forEach((loser) => {
    db.tables.messages.delete(loser);
    db.tables.messageHeaders.delete(loser);
    db.tables.messageEffects.delete(loser);
  });
};

export const mergeIntoKeeper = (
  db: MemoryDatabase,
  plan: GroupMergePlan,
  overrides: PendingOverrides,
): Message | null => {
  const keeper = db.tables.messages.get(plan.keeper.id);
  const donor = db.tables.messages.get(plan.donor.id);
  if (keeper === undefined || donor === undefined) {
    return null;
  }
  const content = withDonorContent(db, keeper, donor);
  const labelOf = labelOfIn(db, keeper.accountId);
  const merged: Message = {
    ...content,
    flags: overlayFlags(keeper.flags, overrides),
    labelIds: overlayLabels(keeper.labelIds, overrides, labelOf),
  };
  db.tables.messageEffects.set(keeper.id, {
    jira: plan.gates.jiraEffectsAt,
    invite: plan.gates.inviteEffectsAt,
  });
  const loserIds = plan.losers.map((loser) => loser.id);
  aliasLosers(db, loserIds, keeper.id);
  deleteLosers(db, loserIds);
  const placements = plan.placements.kept.map((owned) => owned.placement);
  return storePlacements(db, merged, placements);
};

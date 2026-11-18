import type { Message, MessageFlags } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { providerOpRef } from '../shared/provider-ops';
import { flagsDiffer } from './message-diff';

const WRITABLE_FLAGS = ['seen', 'flagged'] as const;

type WritableFlag = (typeof WRITABLE_FLAGS)[number];

const pendingValue = async (
  pendingWork: PendingWorkRepository,
  known: Message,
  flag: WritableFlag,
): Promise<boolean | null> => {
  const ref = providerOpRef(known.id, { kind: 'flag', flag, value: true });
  const op = await pendingWork.find({ accountId: known.accountId, kind: 'provider-op', ref });
  const change = op?.payload.change;
  return change?.kind === 'flag' ? change.value : null;
};

export const syncedFlags = async (
  pendingWork: PendingWorkRepository,
  known: Message,
  remote: MessageFlags,
): Promise<MessageFlags> => {
  let flags: MessageFlags = { ...remote };
  if (!flagsDiffer(flags, known.flags)) {
    return flags;
  }
  for (const flag of WRITABLE_FLAGS) {
    const value = await pendingValue(pendingWork, known, flag);
    flags = value === null ? flags : { ...flags, [flag]: value };
  }
  return flags;
};

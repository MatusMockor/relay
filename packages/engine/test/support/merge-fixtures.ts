import type { AccountId, MailboxId, MessageId, ThreadId } from '@relay/shared/domain';
import type { MergeMember, PendingWork, PendingWorkKind, PendingWorkPayloads } from '../../src';
import { ALL_MAIL, at, INBOX } from './placement-fixtures';

export const MERGE_ACCOUNT = 'acc_merge' as AccountId;
export const MERGE_THREAD = 'thr_merge' as ThreadId;
export const LABEL = 'mbx_label' as MailboxId;
export const KEEPER = 'msg_keeper' as MessageId;
export const LOSER = 'msg_loser' as MessageId;
export const OTHER = 'msg_other' as MessageId;

export const T1 = '2026-11-24T10:00:00.000Z';
export const T2 = '2026-11-24T11:00:00.000Z';

export const member = (id: MessageId, overrides: Partial<MergeMember> = {}): MergeMember => {
  const placements = overrides.placements ?? [at(ALL_MAIL, 1)];
  return {
    id,
    order: 1,
    threadId: MERGE_THREAD,
    inInbox: placements.some((placement) => placement.mailboxId === INBOX),
    primary: placements[0] ?? at(ALL_MAIL, 1),
    placements,
    bodyState: 'local',
    bodyLength: 100,
    gates: { jiraEffectsAt: null, inviteEffectsAt: null },
    ...overrides,
  };
};

export const work = <Kind extends PendingWorkKind>(
  kind: Kind,
  ref: string,
  payload: PendingWorkPayloads[Kind],
  createdAt = T1,
): PendingWork<Kind> => ({
  accountId: MERGE_ACCOUNT,
  kind,
  ref,
  payload,
  createdAt,
  revision: `rev:${kind}:${ref}:${createdAt}`,
});

export const keyOf = (row: PendingWork) => ({
  accountId: row.accountId,
  kind: row.kind,
  ref: row.ref,
});

import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxSyncState } from '../../model/sync-state';
import { completedSyncState } from './completed-sync-state';

export interface MailboxPass {
  readonly mailbox: Mailbox;
  readonly role: MailboxRole;
  readonly state: MailboxSyncState | null;
  readonly status: RemoteMailboxStatus;
}

export const countsChanged = (pass: MailboxPass): boolean =>
  pass.mailbox.unreadCount !== pass.status.unseen ||
  pass.mailbox.totalCount !== pass.status.messages;

export const unchangedSince = (pass: MailboxPass): boolean => {
  const state = completedSyncState(pass.state);
  if (state === null || state.highestModseq === null) {
    return false;
  }
  return (
    state.uidValidity === pass.status.uidValidity &&
    state.uidNext === pass.status.uidNext &&
    state.messageCount === pass.status.messages &&
    state.highestModseq === pass.status.highestModseq
  );
};

export const sizeUnchanged = (pass: MailboxPass): boolean => {
  const state = completedSyncState(pass.state);
  return (
    state !== null &&
    state.uidValidity === pass.status.uidValidity &&
    state.uidNext === pass.status.uidNext &&
    state.messageCount === pass.status.messages
  );
};

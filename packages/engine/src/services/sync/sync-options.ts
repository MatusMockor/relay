import type { MailboxRole } from '@relay/shared/domain';

export interface SyncOptions {
  readonly initialWindowDays: number;
  readonly initialMessageLimit: number;
  readonly mailboxRoles: readonly MailboxRole[];
  readonly batchSize: number;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  initialWindowDays: 30,
  initialMessageLimit: 500,
  mailboxRoles: ['inbox', 'sent', 'archive', 'trash'],
  batchSize: 50,
};

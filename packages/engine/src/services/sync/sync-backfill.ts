import type { Mailbox } from '@relay/shared/domain';
import type { SyncContext } from './sync-context';

export interface SyncBackfill {
  run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void>;
}

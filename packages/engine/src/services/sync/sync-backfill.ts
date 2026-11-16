import type { Mailbox } from '@relay/shared/domain';
import type { SyncContext } from './sync-context';

export interface SyncBackfill {
  run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void>;
}

export class SyncBackfills implements SyncBackfill {
  constructor(private readonly backfills: readonly SyncBackfill[]) {}

  async run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void> {
    for (const backfill of this.backfills) {
      await backfill.run(context, mailboxes);
    }
  }
}

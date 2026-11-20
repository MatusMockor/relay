import type { Mailbox, MailboxId } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { Clock } from '../../ports/clock';
import type { HistoryBackfillRepository } from '../../ports/history-backfill-repository';
import { historyComplete } from './history/history-complete';
import type { ReconcileOptions } from './sync-options';

export interface ReconcileScansDeps {
  readonly history: HistoryBackfillRepository | null;
  readonly clock: Clock;
  readonly options: ReconcileOptions;
}

export class ReconcileScans {
  private readonly fullDiffs = new Map<MailboxId, number>();
  private readonly flagOffsets = new Map<MailboxId, number>();

  constructor(private readonly deps: ReconcileScansDeps) {}

  async skipsExpungeDiff(
    mailbox: Mailbox,
    status: RemoteMailboxStatus,
    localCount: number,
  ): Promise<boolean> {
    const { history, clock, options } = this.deps;
    const lastFull = this.fullDiffs.get(mailbox.id);
    if (history === null || lastFull === undefined || localCount !== status.messages) {
      return false;
    }
    if (clock.now().getTime() - lastFull >= options.fullExpungeDiffMs) {
      return false;
    }
    return historyComplete(await history.find(mailbox.id), status.uidValidity);
  }

  fullExpungeDiffDone(mailboxId: MailboxId): void {
    this.fullDiffs.set(mailboxId, this.deps.clock.now().getTime());
  }

  flagScanUids(mailboxId: MailboxId, localUids: readonly number[]): number[] | undefined {
    const { newestFlagUids, rotatingFlagUids } = this.deps.options;
    if (localUids.length <= newestFlagUids + rotatingFlagUids) {
      return undefined;
    }
    const sorted = [...localUids].sort((left, right) => right - left);
    const older = sorted.slice(newestFlagUids);
    const start = (this.flagOffsets.get(mailboxId) ?? 0) % older.length;
    const rotating = [...older, ...older].slice(start, start + rotatingFlagUids);
    this.flagOffsets.set(mailboxId, (start + rotatingFlagUids) % older.length);
    return [...sorted.slice(0, newestFlagUids), ...rotating].sort((left, right) => left - right);
  }

  forget(mailboxId: MailboxId): void {
    this.fullDiffs.delete(mailboxId);
    this.flagOffsets.delete(mailboxId);
  }
}

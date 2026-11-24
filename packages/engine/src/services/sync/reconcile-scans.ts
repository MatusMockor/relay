import type { MailboxId } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { HistoryBackfillRepository } from '../../ports/history-backfill-repository';
import { historyComplete } from './history/history-complete';
import { type MailboxPass, sizeUnchanged } from './mailbox-pass';
import type { ReconcileOptions } from './sync-options';

export interface ReconcileScansDeps {
  readonly history: HistoryBackfillRepository | null;
  readonly clock: Clock;
  readonly options: ReconcileOptions;
}

export class ReconcileScans {
  private readonly fullDiffs = new Map<MailboxId, number>();
  private readonly watchedSince = new Map<MailboxId, number>();
  private readonly flagOffsets = new Map<MailboxId, number>();

  constructor(private readonly deps: ReconcileScansDeps) {}

  async skipsExpungeDiff(pass: MailboxPass, localCount: number): Promise<boolean> {
    const { mailbox, status } = pass;
    const { history } = this.deps;
    const lastFull = this.fullDiffs.get(mailbox.id);
    if (lastFull === undefined) {
      return false;
    }
    if (this.elapsedSince(lastFull) >= this.deps.options.fullExpungeDiffMs) {
      return false;
    }
    if (sizeUnchanged(pass)) {
      return true;
    }
    if (history === null || localCount !== status.messages) {
      return false;
    }
    return historyComplete(await history.find(mailbox.id), status.uidValidity);
  }

  fullExpungeDiffDue(mailboxId: MailboxId): boolean {
    const since = this.fullDiffs.get(mailboxId) ?? this.watchedSince.get(mailboxId);
    if (since === undefined) {
      this.watchedSince.set(mailboxId, this.deps.clock.now().getTime());
      return false;
    }
    return this.elapsedSince(since) >= this.deps.options.fullExpungeDiffMs;
  }

  fullExpungeDiffDone(mailboxId: MailboxId): void {
    this.fullDiffs.set(mailboxId, this.deps.clock.now().getTime());
  }

  async flagScanUids(mailboxId: MailboxId, localUids: readonly number[]): Promise<number[]> {
    const { newestFlagUids, rotatingFlagUids } = this.deps.options;
    if (localUids.length <= newestFlagUids + rotatingFlagUids) {
      return [...localUids].sort((left, right) => left - right);
    }
    const sorted = [...localUids].sort((left, right) => right - left);
    const older = sorted.slice(newestFlagUids);
    const start = (await this.flagOffset(mailboxId)) % older.length;
    const rotating = [...older, ...older].slice(start, start + rotatingFlagUids);
    await this.saveFlagOffset(mailboxId, (start + rotatingFlagUids) % older.length);
    return [...sorted.slice(0, newestFlagUids), ...rotating].sort((left, right) => left - right);
  }

  forget(mailboxId: MailboxId): void {
    this.fullDiffs.delete(mailboxId);
    this.watchedSince.delete(mailboxId);
    this.flagOffsets.delete(mailboxId);
  }

  private elapsedSince(time: number): number {
    return this.deps.clock.now().getTime() - time;
  }

  private async flagOffset(mailboxId: MailboxId): Promise<number> {
    const cached = this.flagOffsets.get(mailboxId);
    if (cached !== undefined) {
      return cached;
    }
    return (await this.deps.history?.flagScanOffset(mailboxId)) ?? 0;
  }

  private async saveFlagOffset(mailboxId: MailboxId, offset: number): Promise<void> {
    this.flagOffsets.set(mailboxId, offset);
    await this.deps.history?.saveFlagScanOffset(mailboxId, offset);
  }
}

import type { HistoryCursor } from '../../../model/history-backfill';
import type { Clock } from '../../../ports/clock';
import type { HistoryBackfillRepository } from '../../../ports/history-backfill-repository';
import type { HistoryTarget } from './history-mailboxes';

export class HistoryCursors {
  constructor(
    private readonly store: HistoryBackfillRepository,
    private readonly clock: Clock,
  ) {}

  async open(target: HistoryTarget): Promise<HistoryCursor> {
    const stored = await this.store.find(target.mailbox.id);
    if (stored !== null && stored.uidValidity === target.state.uidValidity) {
      return stored;
    }
    return this.write({
      mailboxId: target.mailbox.id,
      accountId: target.state.accountId,
      uidValidity: target.state.uidValidity,
      belowUid: target.state.lastUid + 1,
      doneAt: null,
      updatedAt: this.now(),
    });
  }

  advance(cursor: HistoryCursor, belowUid: number): Promise<HistoryCursor> {
    return this.write({ ...cursor, belowUid, updatedAt: this.now() });
  }

  async lower(cursor: HistoryCursor, belowUid: number): Promise<HistoryCursor> {
    if (belowUid >= cursor.belowUid) {
      return cursor;
    }
    return this.advance(cursor, belowUid);
  }

  finish(cursor: HistoryCursor): Promise<HistoryCursor> {
    const now = this.now();
    return this.write({ ...cursor, belowUid: 1, doneAt: now, updatedAt: now });
  }

  private async write(cursor: HistoryCursor): Promise<HistoryCursor> {
    await this.store.save(cursor);
    return cursor;
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

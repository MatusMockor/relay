import type { Clock } from '../../../ports/clock';
import type { HistoryOptions } from '../sync-options';
import type { HistorySearchGate } from './history-window';

export interface HistoryControl {
  shouldYield(): boolean;
}

export class SliceBudget implements HistorySearchGate {
  private remaining: number;
  private searches: number;
  private readonly deadline: number;

  constructor(
    options: HistoryOptions,
    private readonly clock: Clock,
    private readonly control: HistoryControl,
  ) {
    this.remaining = options.sliceMessages;
    this.searches = options.sliceSearches;
    this.deadline = clock.now().getTime() + options.sliceMs;
  }

  exhausted(): boolean {
    return (
      this.remaining <= 0 ||
      this.clock.now().getTime() >= this.deadline ||
      this.control.shouldYield()
    );
  }

  canSearch(): boolean {
    return this.searches > 0 && !this.exhausted();
  }

  searched(): void {
    this.searches -= 1;
  }

  take(batch: number): number {
    return Math.max(0, Math.min(batch, this.remaining));
  }

  spend(count: number): void {
    this.remaining -= count;
  }
}

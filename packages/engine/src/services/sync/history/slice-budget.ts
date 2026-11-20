import type { Clock } from '../../../ports/clock';
import type { HistoryOptions } from '../sync-options';

export interface HistoryControl {
  shouldYield(): boolean;
}

export class SliceBudget {
  private remaining: number;
  private readonly deadline: number;

  constructor(
    options: HistoryOptions,
    private readonly clock: Clock,
    private readonly control: HistoryControl,
  ) {
    this.remaining = options.sliceMessages;
    this.deadline = clock.now().getTime() + options.sliceMs;
  }

  exhausted(): boolean {
    return (
      this.remaining <= 0 ||
      this.clock.now().getTime() >= this.deadline ||
      this.control.shouldYield()
    );
  }

  take(batch: number): number {
    return Math.max(0, Math.min(batch, this.remaining));
  }

  spend(count: number): void {
    this.remaining -= count;
  }
}

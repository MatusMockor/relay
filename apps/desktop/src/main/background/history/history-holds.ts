import type { Clock } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { HistoryLoopState, HistoryStep } from './history-cadence';

export interface HistoryHold {
  readonly state: HistoryLoopState;
  readonly failures: number;
  readonly resumeAt: number | null;
}

const FRESH: HistoryHold = { state: 'running', failures: 0, resumeAt: null };

export class HistoryHolds {
  private readonly holds = new Map<AccountId, HistoryHold>();

  constructor(private readonly clock: Clock) {}

  of(accountId: AccountId): HistoryHold {
    return this.holds.get(accountId) ?? FRESH;
  }

  keep(accountId: AccountId, step: HistoryStep, failures: number): void {
    const resumeAt = step.delayMs === null ? null : this.now() + step.delayMs;
    this.holds.set(accountId, { state: step.state, failures, resumeAt });
  }

  delayFor(accountId: AccountId, minimumMs: number): number {
    const { resumeAt } = this.of(accountId);
    if (resumeAt === null) {
      return minimumMs;
    }
    return Math.max(minimumMs, resumeAt - this.now());
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}

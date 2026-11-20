import type { AccountId, HistoryProgress } from '@relay/shared/domain';
import type { HistoryLoopState } from './history-cadence';

export interface HistoryLoopStates {
  stateOf(accountId: AccountId): HistoryLoopState | null;
}

export class HistoryProgressSource {
  constructor(
    private readonly read: () => Promise<HistoryProgress[]>,
    private readonly loops: HistoryLoopStates,
  ) {}

  async list(): Promise<HistoryProgress[]> {
    return (await this.read()).map((progress) => this.overlay(progress));
  }

  async of(accountId: AccountId): Promise<HistoryProgress | null> {
    return (await this.list()).find((progress) => progress.accountId === accountId) ?? null;
  }

  private overlay(progress: HistoryProgress): HistoryProgress {
    if (progress.state === 'done') {
      return progress;
    }
    const state = this.loops.stateOf(progress.accountId);
    if (state === 'paused' || state === 'error') {
      return { ...progress, state };
    }
    return progress;
  }
}

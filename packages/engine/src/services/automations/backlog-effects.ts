import type { AutomationActivityAction } from '@relay/shared/domain';
import { DeferredProviderOps } from '../actions/deferred-provider-ops';
import type { ProviderOpSink } from '../actions/provider-op-sink';
import type { AutomationActionContext } from './automation-action';
import type { AutomationActivityRecorder } from './history/automation-activity-recorder';

interface ExecutedThread {
  readonly context: AutomationActionContext;
  readonly outcomes: readonly AutomationActivityAction[];
}

export class BacklogEffects {
  readonly mirror: DeferredProviderOps;
  private readonly executed: ExecutedThread[] = [];

  constructor(
    target: ProviderOpSink,
    private readonly recorder: AutomationActivityRecorder,
  ) {
    this.mirror = new DeferredProviderOps(target);
  }

  executedOn(
    context: AutomationActionContext,
    outcomes: readonly AutomationActivityAction[],
  ): void {
    this.executed.push({ context, outcomes });
  }

  async settle(): Promise<void> {
    await this.mirror.flush();
    const executed = this.executed.splice(0);
    for (const { context, outcomes } of executed) {
      await this.recorder.record(context, 'apply', outcomes);
    }
  }
}

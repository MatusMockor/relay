import type { AiJob, AiOutput, AiRunnerKind } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import type { AiResultApplier } from './ai-result-applier';

export interface AiJobCompletion {
  readonly job: AiJob;
  readonly owner: string;
  readonly runner: AiRunnerKind;
  readonly output: AiOutput;
}

export interface AiJobCompleterDeps {
  readonly unitOfWork: UnitOfWork;
  readonly results: AiResultApplier;
  readonly events: EngineEvents;
  readonly clock: Clock;
}

export class AiJobCompleter {
  constructor(private readonly deps: AiJobCompleterDeps) {}

  async complete({ job, owner, runner, output }: AiJobCompletion): Promise<AiJob | null> {
    const committed = await this.deps.unitOfWork.run(async (repositories) => {
      const done = await repositories.aiJobs.update(job.id, {
        status: 'done',
        output,
        error: null,
        updatedAt: this.deps.clock.now().toISOString(),
        owner,
        fromStatus: 'running',
      });
      if (done === null) {
        return null;
      }
      return { done, effects: await this.deps.results.persist(repositories, job, runner, output) };
    });
    if (committed === null) {
      return null;
    }
    await this.deps.results.publish(committed.effects);
    await this.deps.events.emit(committed.done.userId, 'ai.job.updated', { job: committed.done });
    return committed.done;
  }
}

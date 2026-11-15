import type { AiRunnerLocation, UserId } from '@relay/shared/domain';
import type { AiJobRepository } from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';
import type { EngineEvents } from '../shared/engine-events';

export interface QueuedAiJobRelocatorDeps {
  readonly jobs: AiJobRepository;
  readonly events: EngineEvents;
  readonly clock: Clock;
}

export class QueuedAiJobRelocator {
  constructor(private readonly deps: QueuedAiJobRelocatorDeps) {}

  async relocate(userId: UserId, location: AiRunnerLocation): Promise<number> {
    const now = this.deps.clock.now().toISOString();
    const moved = await this.deps.jobs.relocateQueued(userId, location, now);
    for (const job of moved) {
      await this.deps.events.emit(userId, 'ai.job.updated', { job });
    }
    return moved.length;
  }
}

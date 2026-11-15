import type { AiJob } from '@relay/shared/domain';
import type { AiJobRepository, AiJobUpdate } from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';
import type { EngineEvents } from '../shared/engine-events';

export type AiJobChange = Omit<AiJobUpdate, 'updatedAt' | 'owner' | 'leaseUntil' | 'fromStatus'>;

export interface AiJobStatusWriterDeps {
  readonly jobs: AiJobRepository;
  readonly events: EngineEvents;
  readonly clock: Clock;
}

export class AiJobStatusWriter {
  constructor(private readonly deps: AiJobStatusWriterDeps) {}

  async write(
    job: AiJob,
    owner: string,
    change: AiJobChange,
    leaseUntil: string,
  ): Promise<AiJob | null> {
    const updated = await this.deps.jobs.update(job.id, {
      ...change,
      updatedAt: this.deps.clock.now().toISOString(),
      owner,
      leaseUntil,
      fromStatus: 'running',
    });
    if (updated !== null) {
      await this.deps.events.emit(job.userId, 'ai.job.updated', { job: updated });
    }
    return updated;
  }

  renew(job: AiJob, owner: string, leaseUntil: string): Promise<AiJob | null> {
    return this.deps.jobs.update(job.id, {
      status: 'running',
      updatedAt: this.deps.clock.now().toISOString(),
      owner,
      leaseUntil,
      fromStatus: 'running',
    });
  }
}

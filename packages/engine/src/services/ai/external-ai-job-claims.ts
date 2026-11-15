import type { ClaimAiJobsResponse, ClaimedAiJob } from '@relay/shared/api';
import type { AiJob, ThreadDetail, UserId } from '@relay/shared/domain';
import type { AiJobRepository } from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { Logger } from '../../ports/logger';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import type { ThreadQueryService } from '../threads/thread-query-service';
import { threadIdOf } from './ai-input-context';
import type { AiJobStatusWriter } from './ai-job-status-writer';
import { externalLeaseOwner, externalLeaseUntil } from './external-ai-lease';

export interface ExternalAiJobClaimsDeps {
  readonly jobs: AiJobRepository;
  readonly settings: UserSettingsReader;
  readonly threads: ThreadQueryService;
  readonly writer: AiJobStatusWriter;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly leaseMs: number;
}

export class ExternalAiJobClaims {
  constructor(private readonly deps: ExternalAiJobClaimsDeps) {}

  async claim(userId: UserId, workerId: string, limit: number): Promise<ClaimAiJobsResponse> {
    const location = (await this.deps.settings.read(userId)).ai.location;
    if (location !== 'local') {
      return { location, jobs: [] };
    }
    const queued = await this.deps.jobs.listQueued({
      location: 'local',
      userId,
      now: this.deps.clock.now().toISOString(),
      limit,
    });
    const jobs: ClaimedAiJob[] = [];
    for (const job of queued) {
      const claimed = await this.claimOne(job, workerId);
      if (claimed !== null) {
        jobs.push(claimed);
      }
    }
    return { location, jobs };
  }

  private async claimOne(job: AiJob, workerId: string): Promise<ClaimedAiJob | null> {
    const leaseId = this.deps.ids.generate('aiJob');
    const owner = externalLeaseOwner({ workerId, leaseId });
    const leaseUntil = externalLeaseUntil(this.deps.clock, this.deps.leaseMs);
    const claimed = await this.deps.jobs.claim(job.id, {
      owner,
      location: 'local',
      now: this.deps.clock.now().toISOString(),
      leaseUntil,
    });
    if (claimed === null) {
      return null;
    }
    await this.deps.events.emit(claimed.userId, 'ai.job.updated', { job: claimed });
    try {
      return { job: claimed, leaseId, leaseUntil, thread: await this.threadOf(claimed) };
    } catch (error) {
      this.deps.logger.warn('Dropping a claimed AI job without context', {
        jobId: claimed.id,
        error: errorMessage(error),
      });
      await this.deps.writer.write(
        claimed,
        owner,
        { status: 'error', error: errorMessage(error) },
        leaseUntil,
      );
      return null;
    }
  }

  private async threadOf(job: AiJob): Promise<ThreadDetail | null> {
    const threadId = threadIdOf(job.input);
    return threadId === null ? null : this.deps.threads.getDetail(job.userId, threadId);
  }
}

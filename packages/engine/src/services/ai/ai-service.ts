import type { ClaimAiJobsResponse, CreateAiJobBody } from '@relay/shared/api';
import type {
  AiEvent,
  AiJob,
  AiJobId,
  AiOutput,
  AiRunnerInfo,
  AiRunnerKind,
  AiRunnerLocation,
  UserId,
} from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type { AiJobEnqueueResult, AiJobRepository } from '../../ports/ai-job-repository';
import type { AiRunnerRegistry } from '../../ports/ai-runner-registry';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import type { AiJobExecutor } from './ai-job-executor';
import type { AiJobFactory } from './ai-job-factory';
import type { AiJobLease } from './ai-job-lease';
import type { ExternalAiJobClaims } from './external-ai-job-claims';
import type {
  ExternalAiFailure,
  ExternalAiJobSettlement,
  RenewedAiLease,
} from './external-ai-job-settlement';
import type { ExternalAiLease } from './external-ai-lease';
import type { QueuedAiJobRelocator } from './queued-ai-job-relocator';

export interface AiServiceDeps {
  readonly jobs: AiJobRepository;
  readonly settings: UserSettingsReader;
  readonly relocator: QueuedAiJobRelocator;
  readonly factory: AiJobFactory;
  readonly executor: AiJobExecutor;
  readonly lease: AiJobLease;
  readonly externalClaims: ExternalAiJobClaims;
  readonly externalSettlement: ExternalAiJobSettlement;
  readonly runners: AiRunnerRegistry;
  readonly location: AiRunnerLocation;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface RunJobOptions {
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AiEvent) => void;
}

export const DEFAULT_AI_BATCH = 10;

export class AiService {
  constructor(private readonly deps: AiServiceDeps) {}

  get runnerLocation(): AiRunnerLocation {
    return this.deps.location;
  }

  async locationFor(userId: UserId): Promise<AiRunnerLocation> {
    return (await this.deps.settings.read(userId)).ai.location;
  }

  async relocateQueued(userId: UserId): Promise<number> {
    return this.deps.relocator.relocate(userId, await this.locationFor(userId));
  }

  createJob(userId: UserId, body: CreateAiJobBody): Promise<AiJob> {
    return this.deps.factory.create(userId, body, null);
  }

  enqueueJob(userId: UserId, body: CreateAiJobBody): Promise<AiJobEnqueueResult> {
    return this.deps.factory.enqueue(userId, body);
  }

  async getJob(userId: UserId, jobId: AiJobId): Promise<AiJob> {
    const job = await this.deps.jobs.findById(userId, jobId);
    if (job === null) {
      throw new NotFoundError('AI job', jobId);
    }
    return job;
  }

  listRunners(): Promise<AiRunnerInfo[]> {
    return this.deps.runners.detectAll();
  }

  async runJob(userId: UserId, jobId: AiJobId, options: RunJobOptions = {}): Promise<AiJob> {
    const job = await this.getJob(userId, jobId);
    if (job.runnerLocation !== this.deps.location) {
      throw new ConflictError(`AI job ${jobId} runs on the ${job.runnerLocation} runner`);
    }
    const claim = this.deps.lease.next();
    const claimed = await this.deps.jobs.claim(jobId, claim);
    if (claimed === null) {
      throw new ConflictError(`AI job ${jobId} is already ${job.status}`);
    }
    return this.drain(claimed, claim.owner, options);
  }

  async *run(
    userId: UserId,
    body: CreateAiJobBody,
    signal: AbortSignal | null = null,
  ): AsyncGenerator<AiEvent, AiJob> {
    const claim = this.deps.lease.next();
    const job = await this.deps.factory.create(userId, body, this.deps.location, claim);
    return yield* this.deps.executor.execute(job, signal, claim.owner);
  }

  async processQueued(limit = DEFAULT_AI_BATCH): Promise<AiJob[]> {
    const queued = await this.deps.jobs.listQueued({
      location: this.deps.location,
      now: this.deps.clock.now().toISOString(),
      limit,
    });
    const processed: AiJob[] = [];
    for (const job of queued) {
      const finished = await this.processOne(job);
      if (finished !== null) {
        processed.push(finished);
      }
    }
    return processed;
  }

  claimExternal(userId: UserId, workerId: string, limit: number): Promise<ClaimAiJobsResponse> {
    return this.deps.externalClaims.claim(userId, workerId, limit);
  }

  heartbeatExternal(
    userId: UserId,
    jobId: AiJobId,
    lease: ExternalAiLease,
  ): Promise<RenewedAiLease> {
    return this.deps.externalSettlement.heartbeat(userId, jobId, lease);
  }

  completeExternal(
    userId: UserId,
    jobId: AiJobId,
    lease: ExternalAiLease,
    result: { readonly runner: AiRunnerKind; readonly output: AiOutput },
  ): Promise<AiJob> {
    return this.deps.externalSettlement.complete(userId, jobId, lease, result);
  }

  failExternal(
    userId: UserId,
    jobId: AiJobId,
    lease: ExternalAiLease,
    failure: ExternalAiFailure,
  ): Promise<AiJob> {
    return this.deps.externalSettlement.fail(userId, jobId, lease, failure);
  }

  private async processOne(job: AiJob): Promise<AiJob | null> {
    try {
      const claim = this.deps.lease.next();
      const claimed = await this.deps.jobs.claim(job.id, claim);
      return claimed === null ? null : await this.drain(claimed, claim.owner, {});
    } catch (error) {
      this.deps.logger.warn('Skipping a queued AI job', {
        jobId: job.id,
        error: errorMessage(error),
      });
      return null;
    }
  }

  private async drain(job: AiJob, owner: string, options: RunJobOptions): Promise<AiJob> {
    const execution = this.deps.executor.execute(job, options.signal ?? null, owner);
    let step = await execution.next();
    while (step.done !== true) {
      options.onEvent?.(step.value);
      step = await execution.next();
    }
    return step.value;
  }
}

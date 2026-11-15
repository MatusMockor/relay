import type {
  AiFailureCode,
  AiJob,
  AiJobId,
  AiOutput,
  AiRunnerKind,
  UserId,
} from '@relay/shared/domain';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';
import type { AiJobRepository } from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { AiJobStatusWriter } from './ai-job-status-writer';
import type { AiJobCompleter } from './ai-job-completer';
import { type ExternalAiLease, externalLeaseOwner, externalLeaseUntil } from './external-ai-lease';

export interface ExternalAiJobSettlementDeps {
  readonly jobs: AiJobRepository;
  readonly writer: AiJobStatusWriter;
  readonly completer: AiJobCompleter;
  readonly clock: Clock;
  readonly leaseMs: number;
}

export interface RenewedAiLease {
  readonly job: AiJob;
  readonly leaseUntil: string;
}

export interface ExternalAiFailure {
  readonly code: AiFailureCode;
  readonly message: string;
}

const lostLease = (jobId: AiJobId): ConflictError =>
  new ConflictError(`AI job ${jobId} is no longer leased to this worker`);

export class ExternalAiJobSettlement {
  constructor(private readonly deps: ExternalAiJobSettlementDeps) {}

  async heartbeat(userId: UserId, jobId: AiJobId, lease: ExternalAiLease): Promise<RenewedAiLease> {
    const job = await this.held(userId, jobId);
    const leaseUntil = this.until();
    const renewed = await this.deps.writer.renew(job, externalLeaseOwner(lease), leaseUntil);
    if (renewed === null) {
      throw lostLease(jobId);
    }
    return { job: renewed, leaseUntil };
  }

  async complete(
    userId: UserId,
    jobId: AiJobId,
    lease: ExternalAiLease,
    result: { readonly runner: AiRunnerKind; readonly output: AiOutput },
  ): Promise<AiJob> {
    const job = await this.held(userId, jobId);
    if (result.output.kind !== job.kind) {
      throw new ValidationError(
        `AI job ${jobId} expects ${job.kind} output, got ${result.output.kind}`,
      );
    }
    const owner = externalLeaseOwner(lease);
    const done = await this.deps.completer
      .complete({ job, owner, runner: result.runner, output: result.output })
      .catch(async (error: unknown) => {
        await this.deps.writer.write(
          job,
          owner,
          { status: 'error', output: null, error: errorMessage(error) },
          this.until(),
        );
        throw error;
      });
    if (done === null) {
      throw lostLease(jobId);
    }
    return done;
  }

  async fail(
    userId: UserId,
    jobId: AiJobId,
    lease: ExternalAiLease,
    failure: ExternalAiFailure,
  ): Promise<AiJob> {
    const job = await this.held(userId, jobId);
    return this.settle(job, externalLeaseOwner(lease), {
      status: 'error',
      error: `${failure.code}: ${failure.message}`,
    });
  }

  private async settle(
    job: AiJob,
    owner: string,
    change: Parameters<AiJobStatusWriter['write']>[2],
  ): Promise<AiJob> {
    const settled = await this.deps.writer.write(job, owner, change, this.until());
    if (settled === null) {
      throw lostLease(job.id);
    }
    return settled;
  }

  private async held(userId: UserId, jobId: AiJobId): Promise<AiJob> {
    const job = await this.deps.jobs.findById(userId, jobId);
    if (job === null) {
      throw new NotFoundError('AI job', jobId);
    }
    if (job.status !== 'running' || job.runnerLocation !== 'local') {
      throw new ConflictError(
        `AI job ${jobId} is ${job.status} on the ${job.runnerLocation} runner`,
      );
    }
    return job;
  }

  private until(): string {
    return externalLeaseUntil(this.deps.clock, this.deps.leaseMs);
  }
}

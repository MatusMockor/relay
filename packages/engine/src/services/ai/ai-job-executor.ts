import type { AiEvent, AiJob, AiOutput, AiRunnerKind } from '@relay/shared/domain';
import type { AiJobRepository } from '../../ports/ai-job-repository';
import type { AiRunner } from '../../ports/ai-runner';
import type { AiRunnerRegistry } from '../../ports/ai-runner-registry';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { AiJobCompleter } from './ai-job-completer';
import type { AiJobLease } from './ai-job-lease';
import type { AiJobChange, AiJobStatusWriter } from './ai-job-status-writer';
import type { AiRequestBuilder } from './ai-request-builder';

export interface AiJobExecutorDeps {
  readonly jobs: AiJobRepository;
  readonly runners: AiRunnerRegistry;
  readonly requests: AiRequestBuilder;
  readonly completer: AiJobCompleter;
  readonly writer: AiJobStatusWriter;
  readonly lease: AiJobLease;
  readonly logger: Logger;
}

const STOPPED = 'cancelled: the run was stopped before it finished';

type RunOutcome = { readonly output: AiOutput } | { readonly error: string };

export class AiJobExecutor {
  constructor(private readonly deps: AiJobExecutorDeps) {}

  async *execute(
    job: AiJob,
    signal: AbortSignal | null,
    owner: string,
  ): AsyncGenerator<AiEvent, AiJob> {
    if ((await this.update(job, owner, { status: 'running' })) === null) {
      return await this.lost(job);
    }
    const runner = this.pickRunner(job.runner);
    if (runner === null) {
      const failed = await this.update(job, owner, {
        status: 'error',
        error: 'not_installed: no AI runner is available',
      });
      return failed ?? (await this.lost(job));
    }
    const progress = { settled: false };
    const settle = async (change: AiJobChange): Promise<AiJob> => {
      progress.settled = true;
      return (await this.update(job, owner, change)) ?? (await this.lost(job));
    };
    try {
      const outcome = yield* this.run(job, runner, signal);
      if ('error' in outcome) {
        return await settle({ status: 'error', error: outcome.error });
      }
      const done = await this.deps.completer.complete({
        job,
        owner,
        runner: runner.kind,
        output: outcome.output,
      });
      progress.settled = true;
      return done ?? (await this.lost(job));
    } catch (error) {
      this.deps.logger.warn('AI job failed', { jobId: job.id, error: errorMessage(error) });
      return await settle({ status: 'error', error: errorMessage(error) });
    } finally {
      if (!progress.settled) {
        await this.update(job, owner, { status: 'error', error: STOPPED });
      }
    }
  }

  private async *run(
    job: AiJob,
    runner: AiRunner,
    signal: AbortSignal | null,
  ): AsyncGenerator<AiEvent, RunOutcome> {
    const request = await this.deps.requests.build(job, runner.kind, signal);
    let outcome: RunOutcome = { error: 'invalid_output: the runner finished without output' };
    for await (const event of runner.run(request)) {
      yield event;
      if (event.type === 'failed') {
        outcome = { error: `${event.code}: ${event.message}` };
      }
      if (event.type === 'completed') {
        outcome =
          event.output.kind === job.kind
            ? { output: event.output }
            : { error: `invalid_output: expected ${job.kind}, got ${event.output.kind}` };
      }
    }
    return outcome;
  }

  private pickRunner(kind: AiRunnerKind): AiRunner | null {
    return this.deps.runners.get(kind) ?? this.deps.runners.list()[0] ?? null;
  }

  private update(job: AiJob, owner: string, change: AiJobChange): Promise<AiJob | null> {
    return this.deps.writer.write(job, owner, change, this.deps.lease.until());
  }

  private async lost(job: AiJob): Promise<AiJob> {
    this.deps.logger.warn('AI job was claimed by another worker', { jobId: job.id });
    return (await this.deps.jobs.findById(job.userId, job.id)) ?? job;
  }
}

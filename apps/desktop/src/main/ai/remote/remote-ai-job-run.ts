import {
  type AiMailToolsEndpoint,
  type AiRunner,
  type AiRunnerRegistry,
  jobModelFor,
  type Logger,
} from '@relay/engine';
import { AI_WORKER_ERROR_MAX_LENGTH, api, type ClaimedAiJob } from '@relay/shared/api';
import type { AiFailureCode, AiOutput, AiRunnerKind } from '@relay/shared/domain';
import type { Timers } from '../../platform/timers';
import { startLeaseHeartbeat } from './lease-heartbeat';
import { canonicalServerUrl } from './server-session-key';
import { type WorkerApi, WorkerApiError } from './worker-api';

export interface RemoteAiJobRunDeps {
  readonly api: WorkerApi;
  readonly registry: AiRunnerRegistry;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly timeoutMs: number;
  readonly heartbeatMs: number;
}

type RunOutcome =
  | { readonly output: AiOutput }
  | { readonly code: AiFailureCode; readonly message: string };

const clip = (message: string): string => message.slice(0, AI_WORKER_ERROR_MAX_LENGTH);

export class RemoteAiJobRun {
  constructor(private readonly deps: RemoteAiJobRunDeps) {}

  async run(
    claim: ClaimedAiJob,
    installed: readonly AiRunnerKind[],
    stop: AbortSignal,
  ): Promise<void> {
    if (stop.aborted) {
      this.deps.logger.info('Remote AI job abandoned before it started', { jobId: claim.job.id });
      return;
    }
    const abort = new AbortController();
    const onStop = (): void => {
      abort.abort();
    };
    stop.addEventListener('abort', onStop);
    const heartbeat = startLeaseHeartbeat(
      { ...this.deps, intervalMs: this.deps.heartbeatMs },
      claim,
      onStop,
    );
    try {
      const outcome = await this.execute(claim, installed, abort.signal);
      if (abort.signal.aborted) {
        this.deps.logger.info('Remote AI job abandoned', { jobId: claim.job.id });
        return;
      }
      heartbeat.cancel();
      await this.settle(claim, outcome).catch((error: unknown) => {
        if (!(error instanceof WorkerApiError) || !error.leaseLost) {
          throw error;
        }
        this.deps.logger.warn('Remote AI job was settled elsewhere', { jobId: claim.job.id });
      });
    } finally {
      heartbeat.cancel();
      stop.removeEventListener('abort', onStop);
    }
  }

  private async execute(
    claim: ClaimedAiJob,
    installed: readonly AiRunnerKind[],
    signal: AbortSignal,
  ): Promise<RunOutcome & { readonly runner?: AiRunnerKind }> {
    const kind = installed.includes(claim.job.runner) ? claim.job.runner : installed[0];
    const runner = kind === undefined ? null : this.deps.registry.get(kind);
    if (runner === null) {
      return { code: 'not_installed', message: 'no AI runner is installed on this device' };
    }
    try {
      const mailTools = await this.mailTools(claim);
      return { ...(await this.consume(claim, runner, mailTools, signal)), runner: runner.kind };
    } catch (error) {
      return { code: 'process_failed', message: error instanceof Error ? error.message : 'failed' };
    }
  }

  private async consume(
    claim: ClaimedAiJob,
    runner: AiRunner,
    mailTools: AiMailToolsEndpoint,
    signal: AbortSignal,
  ): Promise<RunOutcome> {
    let outcome: RunOutcome = {
      code: 'invalid_output',
      message: 'the runner finished without output',
    };
    const events = runner.run({
      jobId: claim.job.id,
      userId: claim.job.userId,
      runner: runner.kind,
      ...jobModelFor(claim.job, runner.kind),
      input: claim.job.input,
      thread: claim.thread,
      mailTools,
      timeoutMs: this.deps.timeoutMs,
      signal,
    });
    for await (const event of events) {
      if (event.type === 'failed') {
        outcome = { code: event.code, message: event.message };
      }
      if (event.type === 'completed') {
        outcome =
          event.output.kind === claim.job.kind
            ? { output: event.output }
            : {
                code: 'invalid_output',
                message: `expected ${claim.job.kind}, got ${event.output.kind}`,
              };
      }
    }
    return outcome;
  }

  private async mailTools(claim: ClaimedAiJob): Promise<AiMailToolsEndpoint> {
    const grant = await this.deps.api.call(api.ai.jobMailToolsToken, {
      params: { id: claim.job.id },
      body: { leaseId: claim.leaseId },
    });
    return {
      transport: 'http',
      command: null,
      args: [],
      url: `${canonicalServerUrl(this.deps.api.serverUrl)}${grant.path}`,
      headers: { Authorization: `Bearer ${grant.token}` },
    };
  }

  private async settle(
    claim: ClaimedAiJob,
    outcome: RunOutcome & { readonly runner?: AiRunnerKind },
  ): Promise<void> {
    if ('output' in outcome) {
      const completed = await this.complete(
        claim,
        outcome.runner ?? claim.job.runner,
        outcome.output,
      );
      if (completed) {
        return;
      }
      await this.fail(claim, 'invalid_output', 'the server rejected the output');
      return;
    }
    await this.fail(claim, outcome.code, outcome.message);
  }

  private async complete(
    claim: ClaimedAiJob,
    runner: AiRunnerKind,
    output: AiOutput,
  ): Promise<boolean> {
    try {
      await this.deps.api.call(api.ai.completeJob, {
        params: { id: claim.job.id },
        body: { leaseId: claim.leaseId, runner, output },
      });
      return true;
    } catch (error) {
      if (error instanceof WorkerApiError && error.status === 400) {
        return false;
      }
      throw error;
    }
  }

  private async fail(claim: ClaimedAiJob, code: AiFailureCode, message: string): Promise<void> {
    await this.deps.api.call(api.ai.failJob, {
      params: { id: claim.job.id },
      body: { leaseId: claim.leaseId, code, message: clip(message) },
    });
  }
}

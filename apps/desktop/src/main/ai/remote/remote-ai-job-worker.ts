import type { Logger } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AiRunnerKind } from '@relay/shared/domain';
import { PeriodicRunner } from '../../background/periodic-runner';
import type { Timers } from '../../platform/timers';
import type { InstalledRunners } from './installed-runners';
import type { RemoteAiJobRun } from './remote-ai-job-run';
import type { RemoteAiStatusListener, RemoteAiWorkerStatus } from './remote-ai-worker-status';
import { type WorkerApi, WorkerApiError } from './worker-api';

export interface RemoteAiIntervals {
  readonly localMs: number;
  readonly serverMs: number;
}

export interface RemoteAiJobWorkerDeps {
  readonly api: WorkerApi;
  readonly runners: InstalledRunners;
  readonly jobRun: RemoteAiJobRun;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly intervals: RemoteAiIntervals;
  readonly onStatus: RemoteAiStatusListener;
}

const MAX_JOBS_PER_TICK = 20;

export class RemoteAiJobWorker {
  private readonly loop: PeriodicRunner;
  private readonly stopping = new AbortController();

  constructor(private readonly deps: RemoteAiJobWorkerDeps) {
    this.loop = new PeriodicRunner(
      () => this.tick(),
      deps.intervals.localMs,
      deps.timers,
      (error) => {
        deps.logger.warn('Remote AI worker tick failed', { error });
      },
    );
  }

  start(): void {
    this.loop.start(0);
  }

  wake(): void {
    if (this.loop.isActive) {
      void this.loop.trigger();
    }
  }

  async stop(): Promise<void> {
    this.loop.stop();
    this.stopping.abort();
    await this.loop.idle();
  }

  private async tick(): Promise<void> {
    const installed = await this.deps.runners.list();
    if (installed.length === 0) {
      this.report('noRunner');
      return;
    }
    try {
      for (let run = 0; run < MAX_JOBS_PER_TICK && !this.stopping.signal.aborted; run += 1) {
        if (!(await this.runNext(installed))) {
          return;
        }
      }
    } catch (error) {
      this.onError(error);
    }
  }

  private async runNext(installed: readonly AiRunnerKind[]): Promise<boolean> {
    const batch = await this.deps.api.call(api.ai.claimJobs, { body: { limit: 1 } });
    const local = batch.location === 'local';
    this.loop.setInterval(local ? this.deps.intervals.localMs : this.deps.intervals.serverMs);
    const [claim] = batch.jobs;
    if (claim === undefined || this.stopping.signal.aborted) {
      this.report(local ? 'idle' : 'serverLocation');
      return false;
    }
    this.report('running', { jobId: claim.job.id });
    await this.deps.jobRun.run(claim, installed, this.stopping.signal);
    this.report('idle');
    return true;
  }

  private onError(error: unknown): void {
    if (error instanceof WorkerApiError && error.signedOut) {
      this.report('signedOut');
      return;
    }
    const detail = error instanceof Error ? error.message : 'Remote AI worker failed';
    this.deps.logger.warn('Remote AI worker could not reach the server', { detail });
    this.report('offline', { detail });
  }

  private report(
    state: RemoteAiWorkerStatus['state'],
    extra: Partial<Pick<RemoteAiWorkerStatus, 'jobId' | 'detail'>> = {},
  ): void {
    if (this.stopping.signal.aborted) {
      return;
    }
    this.deps.onStatus({
      state,
      serverUrl: this.deps.api.serverUrl,
      jobId: extra.jobId ?? null,
      detail: extra.detail ?? null,
    });
  }
}

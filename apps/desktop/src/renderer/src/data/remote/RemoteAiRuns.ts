import { type AiEvent, type AiJob, type AiJobId, type AiRunRequest, api } from '@relay/shared';
import { describeError } from '../errors';
import type { AiEventListener, Unsubscribe } from '../MailClient';
import type { HttpApi } from './HttpApi';

const POLL_MS = 1_500;

const eventsOf = (job: AiJob): AiEvent[] => {
  if (job.status === 'done' && job.output !== null) {
    return [{ type: 'completed', output: job.output }];
  }
  if (job.status === 'error') {
    return [{ type: 'failed', code: 'process_failed', message: job.error ?? 'AI úloha zlyhala' }];
  }
  return [];
};

interface Run {
  readonly listener: AiEventListener;
  finished: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

export class RemoteAiRuns {
  private readonly runs = new Map<AiJobId, Run>();
  private generation = 0;

  constructor(private readonly http: HttpApi) {}

  start(request: AiRunRequest, listener: AiEventListener): Unsubscribe {
    let cancelled = false;
    let jobId: AiJobId | null = null;
    const generation = this.generation;
    const live = () => !cancelled && generation === this.generation;
    void this.http
      .call(api.ai.createJob, { body: request })
      .then((job) => {
        if (!live()) {
          return;
        }
        jobId = job.id;
        listener({ type: 'started', runner: job.runner });
        const run: Run = { listener, finished: false, timer: null };
        this.runs.set(job.id, run);
        this.update(job);
        run.timer = run.finished ? null : setInterval(() => void this.poll(job.id), POLL_MS);
      })
      .catch((error: unknown) => {
        if (!live()) {
          return;
        }
        listener({ type: 'failed', code: 'process_failed', message: describeError(error) });
      });
    return () => {
      cancelled = true;
      if (jobId !== null) {
        this.finish(jobId);
      }
    };
  }

  update(job: AiJob): void {
    const run = this.runs.get(job.id);
    if (run === undefined || run.finished) {
      return;
    }
    const events = eventsOf(job);
    if (events.length === 0) {
      return;
    }
    this.finish(job.id);
    events.forEach((event) => {
      run.listener(event);
    });
  }

  stopAll(): void {
    this.generation += 1;
    [...this.runs.keys()].forEach((id) => {
      this.finish(id);
    });
  }

  private async poll(jobId: AiJobId): Promise<void> {
    const job = await this.http.call(api.ai.getJob, { params: { id: jobId } }).catch(() => null);
    if (job !== null) {
      this.update(job);
    }
  }

  private finish(jobId: AiJobId): void {
    const run = this.runs.get(jobId);
    if (run === undefined) {
      return;
    }
    run.finished = true;
    if (run.timer !== null) {
      clearInterval(run.timer);
    }
    this.runs.delete(jobId);
  }
}

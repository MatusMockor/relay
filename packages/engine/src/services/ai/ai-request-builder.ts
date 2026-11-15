import type { AiJob, AiRunnerKind } from '@relay/shared/domain';
import type { AiOptions } from '../../engine-deps';
import type { AiRequest } from '../../model/ai';
import type { ThreadQueryService } from '../threads/thread-query-service';
import { threadIdOf } from './ai-input-context';

export class AiRequestBuilder {
  constructor(
    private readonly threads: ThreadQueryService,
    private readonly options: AiOptions,
  ) {}

  async build(job: AiJob, runner: AiRunnerKind, signal: AbortSignal | null): Promise<AiRequest> {
    const threadId = threadIdOf(job.input);
    const thread = threadId === null ? null : await this.threads.getDetail(job.userId, threadId);
    const tools = this.options.mailTools;
    return {
      jobId: job.id,
      userId: job.userId,
      runner,
      input: job.input,
      thread,
      mailTools: typeof tools === 'function' ? await tools(job) : tools,
      timeoutMs: this.options.timeoutMs,
      signal,
    };
  }
}

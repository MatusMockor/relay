import {
  type AiJob,
  type AiOutput,
  type AiRunnerKind,
  type Task,
  TaskIdSchema,
  type ThreadId,
  type ThreadSummary,
  type UserId,
} from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import type { EngineEvents } from '../shared/engine-events';
import type { AutomationTaskWriter } from '../automations/automation-task-writer';
import type { AiTaskBuilder } from '../tasks/ai-task-builder';
import { isThreadScoped, sourceMessageIdOf, threadIdOf } from './ai-input-context';

export interface AiResultApplierDeps {
  readonly events: EngineEvents;
  readonly tasks: AiTaskBuilder;
  readonly automationTasks: AutomationTaskWriter;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface AiResultEffects {
  readonly userId: UserId;
  readonly thread: ThreadSummary | null;
  readonly task: Task | null;
}

export class AiResultApplier {
  constructor(private readonly deps: AiResultApplierDeps) {}

  async persist(
    repositories: Repositories,
    job: AiJob,
    runner: AiRunnerKind,
    output: AiOutput,
  ): Promise<AiResultEffects> {
    const threadId = threadIdOf(job.input);
    if (isThreadScoped(job.input) && (await this.superseded(repositories, job))) {
      return { userId: job.userId, thread: null, task: null };
    }
    await repositories.aiResults.save({
      id: this.deps.ids.generate('aiResult'),
      userId: job.userId,
      threadId,
      sourceMessageId: sourceMessageIdOf(job.input),
      runner,
      output,
      createdAt: this.deps.clock.now().toISOString(),
    });
    return {
      userId: job.userId,
      thread: await this.oneLiner(repositories, job.userId, threadId, output),
      task: await this.task(repositories, job, threadId, output),
    };
  }

  async publish(effects: AiResultEffects): Promise<void> {
    if (effects.thread !== null) {
      await this.deps.events.emit(effects.userId, 'thread.upserted', { thread: effects.thread });
    }
    if (effects.task !== null) {
      await this.deps.events.emit(effects.userId, 'task.upserted', { task: effects.task });
    }
  }

  private async superseded(repositories: Repositories, job: AiJob): Promise<boolean> {
    await repositories.aiJobs.lockResultSlot(job);
    return repositories.aiJobs.hasNewerDone(job);
  }

  private async oneLiner(
    repositories: Repositories,
    userId: UserId,
    threadId: ThreadId | null,
    output: AiOutput,
  ): Promise<ThreadSummary | null> {
    if (output.kind !== 'oneLiner' || threadId === null) {
      return null;
    }
    await repositories.threads.setAiOneLiner(threadId, output.text);
    return repositories.threads.findById(userId, threadId);
  }

  private async task(
    repositories: Repositories,
    job: AiJob,
    threadId: ThreadId | null,
    output: AiOutput,
  ): Promise<Task | null> {
    if (output.kind === 'automationTask') {
      return this.deps.automationTasks.write(repositories, job, output);
    }
    if (output.kind !== 'createTask') {
      return null;
    }
    const task = await this.deps.tasks.build(repositories.threads, job.userId, {
      id: TaskIdSchema.parse(`task_${job.id}`),
      threadId,
      title: output.title,
      aiWhat: output.aiWhat,
    });
    return repositories.tasks.upsert(task);
  }
}

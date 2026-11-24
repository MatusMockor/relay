import {
  type AiJob,
  type AiOutput,
  type AiRunnerKind,
  type Draft,
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
import { AutomationDraftWriter, type WrittenDraft } from '../automations/automation-draft-writer';
import { AutomationTaskWriter } from '../automations/automation-task-writer';
import type { AiTaskBuilder } from '../tasks/ai-task-builder';
import { isThreadScoped, sourceMessageIdOf, threadIdOf } from './ai-input-context';

export interface AiResultApplierDeps {
  readonly events: EngineEvents;
  readonly tasks: AiTaskBuilder;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface AiResultEffects {
  readonly userId: UserId;
  readonly thread: ThreadSummary | null;
  readonly task: Task | null;
  readonly draft: Draft | null;
}

export class AiResultApplier {
  private readonly automationTasks: AutomationTaskWriter;
  private readonly automationDrafts: AutomationDraftWriter;

  constructor(private readonly deps: AiResultApplierDeps) {
    this.automationTasks = new AutomationTaskWriter(deps.tasks, deps.clock, deps.ids);
    this.automationDrafts = new AutomationDraftWriter(deps.clock, deps.ids);
  }

  async persist(
    repositories: Repositories,
    job: AiJob,
    runner: AiRunnerKind,
    output: AiOutput,
  ): Promise<AiResultEffects> {
    const threadId = threadIdOf(job.input);
    if (isThreadScoped(job.input) && (await this.superseded(repositories, job))) {
      return { userId: job.userId, thread: null, task: null, draft: null };
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
    const drafted = await this.draft(repositories, job, output);
    return {
      userId: job.userId,
      thread: drafted?.thread ?? (await this.oneLiner(repositories, job.userId, threadId, output)),
      task: await this.task(repositories, job, threadId, output),
      draft: drafted?.draft ?? null,
    };
  }

  async publish(effects: AiResultEffects): Promise<void> {
    if (effects.thread !== null) {
      await this.deps.events.emit(effects.userId, 'thread.upserted', { thread: effects.thread });
    }
    if (effects.task !== null) {
      await this.deps.events.emit(effects.userId, 'task.upserted', { task: effects.task });
    }
    if (effects.draft !== null) {
      await this.deps.events.emit(effects.userId, 'draft.upserted', { draft: effects.draft });
    }
  }

  private draft(
    repositories: Repositories,
    job: AiJob,
    output: AiOutput,
  ): Promise<WrittenDraft | null> {
    if (output.kind !== 'automationDraft') {
      return Promise.resolve(null);
    }
    return this.automationDrafts.write(repositories, job, output);
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
      return this.automationTasks.write(repositories, job, output);
    }
    if (output.kind !== 'createTask') {
      return null;
    }
    const task = await this.deps.tasks.build(repositories.threads, job.userId, {
      id: TaskIdSchema.parse(`task_${job.id}`),
      threadId,
      title: output.title,
      aiWhat: output.aiWhat,
      priority: output.priority,
    });
    return repositories.tasks.upsert(task);
  }
}

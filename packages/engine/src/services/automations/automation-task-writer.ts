import {
  type AiJob,
  type AiJobInput,
  type AiOutputOf,
  type JiraKey,
  type Task,
  TaskIdSchema,
} from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import type { AiTaskBuilder } from '../tasks/ai-task-builder';

type AutomationTaskInput = Extract<AiJobInput, { kind: 'automationTask' }>;
type AutomationTaskOutput = AiOutputOf<'automationTask'>;

const MAX_DESCRIPTION = 2_000;

export class AutomationTaskWriter {
  constructor(
    private readonly builder: AiTaskBuilder,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async write(
    repositories: Repositories,
    job: AiJob,
    output: AutomationTaskOutput,
  ): Promise<Task | null> {
    if (job.input.kind !== 'automationTask' || !output.actionable || output.title.trim() === '') {
      return null;
    }
    const description = output.description.trim().slice(0, MAX_DESCRIPTION);
    const aiWhat = description === '' ? null : description;
    if (job.input.jiraKey !== null) {
      return this.writeJira(repositories, job, job.input, job.input.jiraKey, aiWhat, output);
    }
    const task = await this.builder.build(repositories.threads, job.userId, {
      id: TaskIdSchema.parse(`task_${job.id}`),
      threadId: job.input.threadId,
      title: output.title,
      aiWhat,
    });
    return repositories.tasks.upsert(task);
  }

  private async writeJira(
    repositories: Repositories,
    job: AiJob,
    input: AutomationTaskInput,
    jiraKey: JiraKey,
    aiWhat: string | null,
    output: AutomationTaskOutput,
  ): Promise<Task> {
    const built = await this.builder.build(repositories.threads, job.userId, {
      id: this.ids.generate('task'),
      threadId: input.threadId,
      title: output.title,
      aiWhat,
    });
    const { task, created } = await repositories.tasks.createOrGetByJiraKey({
      ...built,
      jiraKey,
      source: 'jira',
    });
    if (created) {
      return task;
    }
    const reopened = await repositories.tasks.update(job.userId, task.id, {
      threadId: input.threadId,
      state: 'open',
      updatedAt: this.clock.now().toISOString(),
    });
    return reopened ?? task;
  }
}

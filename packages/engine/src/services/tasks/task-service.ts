import type { TaskListQuery, TaskPage, UpdateTaskBody } from '@relay/shared/api';
import type { Task, TaskId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TaskChanges, TaskRepository } from '../../ports/task-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { EngineEvents } from '../shared/engine-events';
import type { JiraTaskEvent, JiraTaskSink } from '../sync/jira-task-sink';
import { AiTaskBuilder, type AiTaskInput } from './ai-task-builder';
import { jiraTaskTitle, nextJiraTaskState } from './jira-task-planner';

export interface TaskServiceDeps {
  readonly tasks: TaskRepository;
  readonly threads: ThreadRepository;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class TaskService implements JiraTaskSink {
  private readonly aiTasks: AiTaskBuilder;

  constructor(private readonly deps: TaskServiceDeps) {
    this.aiTasks = new AiTaskBuilder(deps.clock, deps.ids);
  }

  list(userId: UserId, query: TaskListQuery): Promise<TaskPage> {
    return this.deps.tasks.list(userId, {
      state: query.state ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
  }

  update(userId: UserId, taskId: TaskId, patch: UpdateTaskBody): Promise<Task> {
    return this.change(userId, taskId, {
      ...(patch.state === undefined ? {} : { state: patch.state }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      updatedAt: this.now(),
    });
  }

  async applyJiraEvent(userId: UserId, event: JiraTaskEvent): Promise<Task> {
    const existing = await this.deps.tasks.findByJiraKey(userId, event.classification.jiraKey);
    if (existing !== null) {
      return this.change(userId, existing.id, {
        threadId: event.threadId,
        state: nextJiraTaskState(existing, event),
        updatedAt: this.now(),
      });
    }
    const now = this.now();
    return this.save(userId, {
      id: this.deps.ids.generate('task'),
      userId,
      threadId: event.threadId,
      jiraKey: event.classification.jiraKey,
      title: jiraTaskTitle(event),
      aiWhat: null,
      state: 'open',
      source: 'jira',
      createdAt: now,
      updatedAt: now,
    });
  }

  async createFromAi(userId: UserId, input: AiTaskInput): Promise<Task> {
    return this.save(userId, await this.aiTasks.build(this.deps.threads, userId, input));
  }

  private async change(userId: UserId, taskId: TaskId, changes: TaskChanges): Promise<Task> {
    const task = await this.deps.tasks.update(userId, taskId, changes);
    if (task === null) {
      throw new NotFoundError('Task', taskId);
    }
    await this.deps.events.emit(userId, 'task.upserted', { task });
    return task;
  }

  private async save(userId: UserId, task: Task): Promise<Task> {
    const saved = await this.deps.tasks.upsert(task);
    await this.deps.events.emit(userId, 'task.upserted', { task: saved });
    return saved;
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}

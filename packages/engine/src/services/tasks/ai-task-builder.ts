import type { Task, TaskId, ThreadId, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { ThreadRepository } from '../../ports/thread-repository';

export interface AiTaskInput {
  readonly id?: TaskId;
  readonly threadId: ThreadId | null;
  readonly title: string;
  readonly aiWhat: string | null;
}

export class AiTaskBuilder {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async build(threads: ThreadRepository, userId: UserId, input: AiTaskInput): Promise<Task> {
    const title = input.title.trim().slice(0, 500);
    if (title === '') {
      throw new ValidationError('Task title must not be empty');
    }
    if (input.threadId !== null && (await threads.findById(userId, input.threadId)) === null) {
      throw new NotFoundError('Thread', input.threadId);
    }
    const now = this.clock.now().toISOString();
    return {
      id: input.id ?? this.ids.generate('task'),
      userId,
      threadId: input.threadId,
      jiraKey: null,
      title,
      aiWhat: input.aiWhat,
      state: 'open',
      source: 'ai',
      createdAt: now,
      updatedAt: now,
    };
  }
}

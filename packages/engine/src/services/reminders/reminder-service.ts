import type { Reminder, ThreadId, ThreadSummary, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { ReminderRepository } from '../../ports/reminder-repository';
import type { Repositories } from '../../ports/repositories';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';

export interface ReminderScheduler {
  schedule(userId: UserId, threadId: ThreadId, at: string): Promise<ThreadSummary>;
  cancel(userId: UserId, threadId: ThreadId): Promise<ThreadSummary>;
}

export interface ReminderServiceDeps {
  readonly reminders: ReminderRepository;
  readonly threads: ThreadRepository;
  readonly unitOfWork: UnitOfWork;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export const DEFAULT_REMINDER_BATCH = 100;

export class ReminderService implements ReminderScheduler {
  constructor(private readonly deps: ReminderServiceDeps) {}

  async schedule(userId: UserId, threadId: ThreadId, at: string): Promise<ThreadSummary> {
    const now = this.deps.clock.now();
    if (Date.parse(at) <= now.getTime()) {
      throw new ValidationError('Reminder time must be in the future');
    }
    const remindAt = new Date(Date.parse(at)).toISOString();
    const thread = await this.deps.unitOfWork.run(async (repositories) => {
      await this.requireThread(repositories, userId, threadId);
      const existing = await repositories.reminders.findActiveByThread(userId, threadId);
      await repositories.reminders.upsert({
        id: existing?.id ?? this.deps.ids.generate('reminder'),
        userId,
        threadId,
        remindAt,
        firedAt: null,
        createdAt: existing?.createdAt ?? now.toISOString(),
      });
      return repositories.threads.updateState(userId, threadId, { state: 'reminder', remindAt });
    });
    return this.publish(userId, threadId, thread);
  }

  async cancel(userId: UserId, threadId: ThreadId): Promise<ThreadSummary> {
    const thread = await this.deps.unitOfWork.run(async (repositories) => {
      const current = await this.requireThread(repositories, userId, threadId);
      const existing = await repositories.reminders.findActiveByThread(userId, threadId);
      if (existing !== null) {
        await repositories.reminders.delete(userId, existing.id);
      }
      const state = current.state === 'reminder' ? 'inbox' : current.state;
      return repositories.threads.updateState(userId, threadId, { state, remindAt: null });
    });
    return this.publish(userId, threadId, thread);
  }

  async fireDue(limit = DEFAULT_REMINDER_BATCH): Promise<ThreadSummary[]> {
    const now = this.deps.clock.now().toISOString();
    const due = await this.deps.reminders.listDue(now, limit);
    const fired: ThreadSummary[] = [];
    for (const reminder of due) {
      const thread = await this.fire(reminder, now);
      if (thread !== null) {
        await this.deps.events.emit(reminder.userId, 'thread.upserted', { thread });
        fired.push(thread);
      }
    }
    return fired;
  }

  private fire(reminder: Reminder, now: string): Promise<ThreadSummary | null> {
    return this.deps.unitOfWork.run(async (repositories) => {
      const active = await repositories.reminders.findActiveByThread(
        reminder.userId,
        reminder.threadId,
      );
      if (active?.id !== reminder.id || Date.parse(active.remindAt) > Date.parse(now)) {
        return null;
      }
      await repositories.reminders.markFired(reminder.id, now);
      const thread = await repositories.threads.findById(reminder.userId, reminder.threadId);
      if (thread === null) {
        return null;
      }
      const state = thread.state === 'trash' ? 'trash' : 'inbox';
      return repositories.threads.updateState(reminder.userId, reminder.threadId, {
        state,
        remindAt: null,
      });
    });
  }

  private async requireThread(
    repositories: Repositories,
    userId: UserId,
    threadId: ThreadId,
  ): Promise<ThreadSummary> {
    const thread = await repositories.threads.findById(userId, threadId);
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    return thread;
  }

  private async publish(
    userId: UserId,
    threadId: ThreadId,
    thread: ThreadSummary | null,
  ): Promise<ThreadSummary> {
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    await this.deps.events.emit(userId, 'thread.upserted', { thread });
    return thread;
  }
}

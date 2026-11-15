import type { Message, ThreadId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import { publishThreadOutcomes, refreshThread } from '../shared/thread-refresh';
import type { JiraTaskSink } from './jira-task-sink';
import { inboxMailboxIds, type SyncContext } from './sync-context';
import { threadWorkHint } from './thread-refresh-work';

export interface ChangeFlusherDeps {
  readonly unitOfWork: UnitOfWork;
  readonly pendingWork: PendingWorkRepository;
  readonly messages: MessageRepository;
  readonly events: EngineEvents;
  readonly tasks: JiraTaskSink;
  readonly logger: Logger;
}

export class ChangeFlusher {
  constructor(private readonly deps: ChangeFlusherDeps) {}

  async flush(context: SyncContext): Promise<void> {
    const removed = await this.refreshThreads(context);
    await this.applyMessageEffects(context, removed);
    await this.applyJiraEvents(context, removed);
  }

  private async refreshThreads(context: SyncContext): Promise<Set<ThreadId>> {
    const { userId, account } = context;
    const work = await this.deps.pendingWork.list(account.id, 'thread-refresh');
    if (work.length === 0) {
      return new Set();
    }
    const inboxIds = inboxMailboxIds(context);
    const outcomes = await this.deps.unitOfWork.run(async (repositories) => {
      const results = [];
      for (const item of work) {
        const hint = threadWorkHint(item.payload, inboxIds);
        results.push(
          await refreshThread(repositories, userId, account.id, item.payload.threadId, hint),
        );
      }
      await repositories.pendingWork.remove(work);
      return results;
    });
    context.stats.updatedThreads += outcomes.length;
    await publishThreadOutcomes(this.deps.events, userId, outcomes);
    return new Set(
      outcomes.flatMap((outcome) => (outcome.kind === 'removed' ? [outcome.threadId] : [])),
    );
  }

  private async applyMessageEffects(context: SyncContext, removed: ReadonlySet<ThreadId>) {
    const queued = new Set(context.arrivalWork.map((item) => item.ref));
    const work = await this.deps.pendingWork.list(context.account.id, 'message-effects');
    for (const item of work.filter((entry) => !queued.has(entry.ref))) {
      const { payload } = item;
      const message = removed.has(payload.threadId)
        ? null
        : await this.deps.messages.findById(context.userId, payload.messageId);
      if (message === null || !payload.arrival) {
        await this.publish(context, message, payload.publish);
        await this.deps.pendingWork.remove([item]);
        continue;
      }
      await this.publish(context, message, payload.publish);
      const arrival = payload.publish
        ? await this.deps.pendingWork.put({ ...item, payload: { ...payload, publish: false } })
        : item;
      context.arrivals.push({ message, headers: new Map(payload.headers) });
      context.arrivalWork.push(arrival);
    }
  }

  private async publish(context: SyncContext, message: Message | null, publish: boolean) {
    if (message === null || !publish) {
      return;
    }
    await this.deps.events.emit(context.userId, 'message.upserted', { message });
  }

  private async applyJiraEvents(context: SyncContext, removed: ReadonlySet<ThreadId>) {
    const work = await this.deps.pendingWork.list(context.account.id, 'jira-event');
    for (const item of work) {
      if (removed.has(item.payload.threadId)) {
        await this.deps.pendingWork.remove([item]);
        continue;
      }
      try {
        await this.deps.tasks.applyJiraEvent(context.userId, item.payload);
        await this.deps.pendingWork.remove([item]);
      } catch (error) {
        this.deps.logger.warn('Applying a Jira task failed', {
          jiraKey: item.payload.classification.jiraKey,
          error: errorMessage(error),
        });
      }
    }
  }
}

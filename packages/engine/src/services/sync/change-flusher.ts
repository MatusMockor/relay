import type { ThreadId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import { publishThreadOutcomes, refreshThread } from '../shared/thread-refresh';
import type { JiraTaskSink } from './jira-task-sink';
import { inboxMailboxIds, type SyncContext } from './sync-context';
import { ThreadChangeSet } from './thread-change-set';

export interface ChangeFlusherDeps {
  readonly unitOfWork: UnitOfWork;
  readonly events: EngineEvents;
  readonly tasks: JiraTaskSink;
  readonly logger: Logger;
}

export interface FlushOptions {
  readonly publishMessages: boolean;
}

export class ChangeFlusher {
  constructor(private readonly deps: ChangeFlusherDeps) {}

  async flush(context: SyncContext, options: FlushOptions): Promise<void> {
    if (context.changes.size === 0) {
      return;
    }
    const drained = context.changes.drain();
    const inboxIds = inboxMailboxIds(context);
    const outcomes = await this.deps.unitOfWork.run(async (repositories) => {
      const results = [];
      for (const [threadId, change] of drained.threads) {
        results.push(
          await refreshThread(
            repositories,
            context.userId,
            context.account.id,
            threadId,
            ThreadChangeSet.hint(change, inboxIds),
          ),
        );
      }
      return results;
    });
    context.stats.updatedThreads += outcomes.length;
    await publishThreadOutcomes(this.deps.events, context.userId, outcomes);
    const removed = new Set<ThreadId>(
      outcomes.flatMap((outcome) => (outcome.kind === 'removed' ? [outcome.threadId] : [])),
    );
    if (options.publishMessages) {
      for (const message of drained.createdMessages.filter((item) => !removed.has(item.threadId))) {
        await this.deps.events.emit(context.userId, 'message.upserted', { message });
      }
    }
    for (const event of drained.jiraEvents.filter((item) => !removed.has(item.threadId))) {
      await this.deps.tasks.applyJiraEvent(context.userId, event).catch((error: unknown) => {
        this.deps.logger.warn('Applying a Jira task failed', {
          jiraKey: event.classification.jiraKey,
          error: errorMessage(error),
        });
      });
    }
  }
}

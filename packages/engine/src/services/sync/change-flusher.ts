import type { Message, ThreadId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import { MailCopies } from '../shared/mail-copies';
import { pendingMoveRoles } from '../shared/provider-ops';
import type { CalendarPartsSink } from './calendar-parts-sink';
import {
  publishThreadOutcomes,
  refreshThread,
  type ThreadRefreshOutcome,
} from '../shared/thread-refresh';
import type { JiraTaskSink } from './jira-task-sink';
import type { SyncContext } from './sync-context';
import { messageRoleOf } from './synced-thread-state';
import { threadWorkHint } from './thread-refresh-work';

export interface ChangeFlusherDeps {
  readonly unitOfWork: UnitOfWork;
  readonly pendingWork: PendingWorkRepository;
  readonly messages: MessageRepository;
  readonly events: EngineEvents;
  readonly tasks: JiraTaskSink;
  readonly calendarParts: CalendarPartsSink;
  readonly logger: Logger;
  readonly bulkEventThreshold: number;
}

export class ChangeFlusher {
  constructor(private readonly deps: ChangeFlusherDeps) {}

  async flush(context: SyncContext): Promise<void> {
    const outcomes = await this.refreshThreads(context);
    await publishThreadOutcomes(this.deps.events, context.userId, outcomes);
    const removed = removedThreads(outcomes);
    await this.applyMessageEffects(context, removed);
    await this.applyJiraEvents(context, removed);
    await this.deps.calendarParts.flush(context.userId, context.account);
  }

  async flushQuietly(context: SyncContext): Promise<void> {
    const outcomes = await this.refreshThreads(context);
    if (outcomes.length <= this.deps.bulkEventThreshold) {
      await publishThreadOutcomes(this.deps.events, context.userId, outcomes);
      return;
    }
    await this.deps.events.emit(context.userId, 'threads.changed', {
      accountId: context.account.id,
      count: outcomes.length,
    });
  }

  private async refreshThreads(context: SyncContext): Promise<ThreadRefreshOutcome[]> {
    const { userId, account } = context;
    const work = await this.deps.pendingWork.list(account.id, 'thread-refresh');
    if (work.length === 0) {
      return [];
    }
    const outcomes = await this.deps.unitOfWork.run(async (repositories) => {
      const pendingMoves = await pendingMoveRoles(repositories.pendingWork, account.id);
      const roleOf = messageRoleOf(context.mailboxRoles, pendingMoves);
      const copies = MailCopies.of(account);
      const results = [];
      for (const item of work) {
        const hint = threadWorkHint(item.payload, roleOf, copies);
        results.push(
          await refreshThread(repositories, userId, account.id, item.payload.threadId, hint),
        );
      }
      await repositories.pendingWork.remove(work);
      return results;
    });
    context.stats.updatedThreads += outcomes.length;
    return outcomes;
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
      context.arrivals.push({
        message,
        headers: new Map(payload.headers),
        jira: payload.jira ?? null,
        live: payload.live ?? false,
      });
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
        await this.deps.tasks.applyJiraEvent(context.userId, item.payload, {
          accountId: context.account.id,
        });
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

const removedThreads = (outcomes: readonly ThreadRefreshOutcome[]): Set<ThreadId> =>
  new Set(outcomes.flatMap((outcome) => (outcome.kind === 'removed' ? [outcome.threadId] : [])));

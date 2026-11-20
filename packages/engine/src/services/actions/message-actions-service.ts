import type {
  Message,
  MessageId,
  ThreadAction,
  ThreadId,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { ReminderScheduler } from '../reminders/reminder-service';
import type { EngineEvents } from '../shared/engine-events';
import type { ThreadReadMarker } from '../threads/thread-query-service';
import type { LabelHandler } from './handlers/label-handler';
import type { MoveHandler } from './handlers/move-handler';
import type { PinHandler } from './handlers/pin-handler';
import type { ReadStateHandler } from './handlers/read-state-handler';
import type { StateMoveHandler, StateMoveOutcome } from './handlers/state-move-handler';
import {
  isCommitted,
  type MessageRevert,
  type TrackedAction,
  type TrackedChange,
  writtenBy,
} from './message-changes';
import type { ThreadActionContext } from './thread-action-context';

export type { MessageRevert, TrackedAction, TrackedChange } from './message-changes';

export interface MessageActionsServiceDeps {
  readonly threads: ThreadRepository;
  readonly messages: MessageRepository;
  readonly accounts: AccountRepository;
  readonly stateMoves: StateMoveHandler;
  readonly moves: MoveHandler;
  readonly readState: ReadStateHandler;
  readonly pins: PinHandler;
  readonly labels: LabelHandler;
  readonly reminders: ReminderScheduler;
  readonly events: EngineEvents;
}

export class MessageActionsService implements ThreadReadMarker {
  constructor(private readonly deps: MessageActionsServiceDeps) {}

  markRead(userId: UserId, threadId: ThreadId): Promise<ThreadSummary> {
    return this.apply(userId, threadId, { type: 'markRead' });
  }

  async pin(userId: UserId, threadId: ThreadId): Promise<ThreadSummary> {
    const thread = await this.deps.pins.pin(await this.context(userId, threadId));
    await this.deps.events.emit(userId, 'thread.upserted', { thread });
    return thread;
  }

  async applyTracked(
    userId: UserId,
    threadId: ThreadId,
    action: TrackedAction,
  ): Promise<TrackedChange> {
    const context = await this.context(userId, threadId);
    const written = writtenBy(action, context.messages);
    const outcome = await this.locationOrFlags(context, action).catch(
      async (error: unknown): Promise<StateMoveOutcome> => ({
        thread: await this.committedThread(context, action, written, error),
        moved: [],
        labelled: [],
        origins: [],
      }),
    );
    await this.deps.events
      .emit(userId, 'thread.upserted', { thread: outcome.thread })
      .catch(() => undefined);
    return {
      thread: outcome.thread,
      previousState: context.thread.state,
      written: [...written.map(({ id }) => id), ...outcome.moved],
      labelled: outcome.labelled,
      origins: outcome.origins,
    };
  }

  private async locationOrFlags(
    context: ThreadActionContext,
    action: TrackedAction,
  ): Promise<StateMoveOutcome> {
    if (action.type === 'archive') {
      return this.deps.stateMoves.handleTracked(context, 'archive');
    }
    if (action.type === 'move') {
      return this.deps.moves.moveTracked(context, action.mailboxId);
    }
    const thread =
      action.type === 'pin'
        ? await this.deps.pins.pin(context)
        : await this.dispatch(context, action);
    return { thread, moved: [], labelled: [], origins: [] };
  }

  private async committedThread(
    { userId, thread }: ThreadActionContext,
    action: TrackedAction,
    written: readonly Message[],
    error: unknown,
  ): Promise<ThreadSummary> {
    const current = await this.deps.messages.listByThread(userId, thread.id);
    const stored = await this.deps.threads.findById(userId, thread.id);
    if (stored === null || !isCommitted(action, written, current)) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return stored;
  }

  async revert(
    userId: UserId,
    threadId: ThreadId,
    messageIds: readonly MessageId[],
    revert: MessageRevert,
  ): Promise<ThreadSummary> {
    const context = await this.context(userId, threadId);
    const targets = new Set<string>(messageIds);
    const thread = await this.revertOn(
      { ...context, messages: context.messages.filter((message) => targets.has(message.id)) },
      revert,
    );
    await this.deps.events.emit(userId, 'thread.upserted', { thread });
    return thread;
  }

  async apply(userId: UserId, threadId: ThreadId, action: ThreadAction): Promise<ThreadSummary> {
    if (action.type === 'remind') {
      return this.deps.reminders.schedule(userId, threadId, action.at);
    }
    if (action.type === 'cancelReminder') {
      return this.deps.reminders.cancel(userId, threadId);
    }
    const context = await this.context(userId, threadId);
    const thread = await this.dispatch(context, action);
    await this.deps.events.emit(userId, 'thread.upserted', { thread });
    return thread;
  }

  private revertOn(context: ThreadActionContext, revert: MessageRevert): Promise<ThreadSummary> {
    switch (revert.type) {
      case 'markUnread':
        return this.deps.readState.markAllUnread(context);
      case 'unpin':
        return this.deps.pins.unpinAll(context);
      case 'removeLabel':
        return this.deps.labels.remove(context, revert.labelId);
      case 'returnToInbox':
        return this.deps.stateMoves.handle(context, 'undone');
    }
  }

  private dispatch(
    context: ThreadActionContext,
    action: Exclude<ThreadAction, { type: 'remind' | 'cancelReminder' }>,
  ): Promise<ThreadSummary> {
    switch (action.type) {
      case 'done':
      case 'archive':
      case 'undone':
      case 'trash':
      case 'restore':
      case 'reportSpam':
      case 'notSpam':
        return this.deps.stateMoves.handle(context, action.type);
      case 'markRead':
        return this.deps.readState.markRead(context);
      case 'markUnread':
        return this.deps.readState.markUnread(context);
      case 'addLabel':
        return this.deps.labels.add(context, action.labelId);
      case 'removeLabel':
        return this.deps.labels.remove(context, action.labelId);
      case 'move':
        return this.deps.moves.move(context, action.mailboxId);
      case 'undoMove':
        return this.deps.moves.undo(context);
    }
  }

  private async context(userId: UserId, threadId: ThreadId): Promise<ThreadActionContext> {
    const thread = await this.deps.threads.findById(userId, threadId);
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const account = await this.deps.accounts.findById(userId, thread.accountId);
    if (account === null) {
      throw new NotFoundError('Account', thread.accountId);
    }
    const messages = await this.deps.messages.listByThread(userId, threadId);
    return { userId, thread, account, messages };
  }
}

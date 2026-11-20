import type {
  LabelId,
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
import type { StateMoveHandler } from './handlers/state-move-handler';
import type { ThreadActionContext } from './thread-action-context';

export type MessageRevert =
  | { readonly type: 'markUnread' }
  | { readonly type: 'unpin' }
  | { readonly type: 'removeLabel'; readonly labelId: LabelId };

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

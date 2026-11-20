import type { Message, MessageId, ThreadSummary, UserId } from '@relay/shared/domain';
import type { MessageRepository } from '../../../ports/message-repository';
import type { MessageActionsService, MessageRevert } from '../../actions/message-actions-service';
import type {
  ActivityReverser,
  RecordedAction,
  ReverseOutcome,
  ReversibleActionType,
} from './activity-reverser';

type StillChanged<Type extends ReversibleActionType> = (
  message: Message,
  recorded: RecordedAction<Type>,
) => boolean;

class MessageChangeReverser<Type extends ReversibleActionType> implements ActivityReverser<Type> {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly messages: MessageRepository,
    private readonly stillChanged: StillChanged<Type>,
    private readonly revertOf: (recorded: RecordedAction<Type>) => MessageRevert,
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<Type>,
  ): Promise<ReverseOutcome> {
    const targets = await this.targets(userId, thread, recorded);
    if (targets.length === 0) {
      return 'skipped';
    }
    await this.actions.revert(userId, thread.id, targets, this.revertOf(recorded));
    return 'undone';
  }

  private async targets(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<Type>,
  ): Promise<MessageId[]> {
    const changed = new Set<string>(recorded.changed);
    return (await this.messages.listByThread(userId, thread.id))
      .filter((message) => changed.has(message.id) && this.stillChanged(message, recorded))
      .map((message) => message.id);
  }
}

export const markReadReverser = (
  actions: MessageActionsService,
  messages: MessageRepository,
): ActivityReverser<'markRead'> =>
  new MessageChangeReverser<'markRead'>(
    actions,
    messages,
    (message) => message.flags.seen,
    () => ({ type: 'markUnread' }),
  );

export const pinReverser = (
  actions: MessageActionsService,
  messages: MessageRepository,
): ActivityReverser<'pin'> =>
  new MessageChangeReverser<'pin'>(
    actions,
    messages,
    (message) => message.flags.flagged,
    () => ({ type: 'unpin' }),
  );

export const addLabelReverser = (
  actions: MessageActionsService,
  messages: MessageRepository,
): ActivityReverser<'addLabel'> =>
  new MessageChangeReverser<'addLabel'>(
    actions,
    messages,
    (message, { action }) => message.labelIds.includes(action.labelId),
    ({ action }) => ({ type: 'removeLabel', labelId: action.labelId }),
  );

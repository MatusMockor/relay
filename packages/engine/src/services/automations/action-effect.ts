import type { AutomationActivityAction, Message, MessageId } from '@relay/shared/domain';
import type { TrackedChange } from '../actions/message-changes';

export type ActionEffect = Pick<AutomationActivityAction, 'changed' | 'previousState'>;

export const NO_EFFECT: ActionEffect = { changed: [], previousState: null };

export const writtenEffect = ({ written, previousState }: TrackedChange): ActionEffect => ({
  changed: written.map(({ id }) => id),
  previousState,
});

const physicalKey = (message: Message): string =>
  message.emailId ?? message.messageIdHeader ?? message.id;

export const relocatedMessages = (
  before: readonly Message[],
  after: readonly Message[],
): MessageId[] => {
  const previous = new Map(before.map((message) => [message.id, message]));
  const remaining = new Set(after.map(({ id }) => id));
  const vanished = new Set(
    before.filter(({ id }) => !remaining.has(id)).map((message) => physicalKey(message)),
  );
  return after
    .filter((message) => {
      const earlier = previous.get(message.id);
      if (earlier === undefined) {
        return vanished.has(physicalKey(message));
      }
      return (
        earlier.mailboxId !== message.mailboxId ||
        message.labelIds.some((labelId) => !earlier.labelIds.includes(labelId)) ||
        vanished.has(physicalKey(message))
      );
    })
    .map(({ id }) => id);
};

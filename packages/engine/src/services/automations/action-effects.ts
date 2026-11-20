import type { AutomationAction, Message, MessageId } from '@relay/shared/domain';

type MessageChange = (before: Message, after: Message | undefined) => boolean;

const gained =
  (read: (message: Message) => boolean): MessageChange =>
  (before, after) =>
    after !== undefined && !read(before) && read(after);

const relocated: MessageChange = (before, after) =>
  after === undefined ||
  after.mailboxId !== before.mailboxId ||
  after.labelIds.some((labelId) => !before.labelIds.includes(labelId));

const changeOf = (action: AutomationAction): MessageChange | null => {
  switch (action.type) {
    case 'markRead':
      return gained((message) => message.flags.seen);
    case 'pin':
      return gained((message) => message.flags.flagged);
    case 'addLabel':
      return gained((message) => message.labelIds.includes(action.labelId));
    case 'moveTo':
    case 'archive':
      return relocated;
    default:
      return null;
  }
};

export const tracksEffects = (action: AutomationAction): boolean => changeOf(action) !== null;

export const changedMessages = (
  action: AutomationAction,
  before: readonly Message[],
  after: readonly Message[],
): MessageId[] => {
  const change = changeOf(action);
  if (change === null) {
    return [];
  }
  const current = new Map(after.map((message) => [message.id, message]));
  return before
    .filter((message) => change(message, current.get(message.id)))
    .map((message) => message.id);
};

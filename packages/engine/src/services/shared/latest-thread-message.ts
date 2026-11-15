import type { Message, ThreadId, UserId } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import { byDateAscending } from './dates';

export const latestThreadMessage = async (
  messages: MessageRepository,
  userId: UserId,
  threadId: ThreadId,
): Promise<Message | null> =>
  [...(await messages.listByThread(userId, threadId))].sort(byDateAscending).at(-1) ?? null;

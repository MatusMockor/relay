import type { UpdateDraftBody } from '@relay/shared/api';
import type { Draft, UserId } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';

export const withoutStaleReplyReference = async (
  messages: MessageRepository,
  userId: UserId,
  current: Draft,
  patch: UpdateDraftBody,
): Promise<UpdateDraftBody> => {
  const replied = patch.inReplyToMessageId;
  if (replied === undefined || replied === null || replied === current.inReplyToMessageId) {
    return patch;
  }
  if (current.inReplyToMessageId === null) {
    return patch;
  }
  if ((await messages.findById(userId, replied)) !== null) {
    return patch;
  }
  const { inReplyToMessageId: _stale, ...rest } = patch;
  return rest;
};

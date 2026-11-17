import {
  NO_UNSUBSCRIBE,
  type ThreadId,
  type UnsubscribeOptions,
  type UserId,
} from '@relay/shared/domain';
import { NotFoundError, NotImplementedError, ValidationError } from '../../errors';
import type { MessageRepository } from '../../ports/message-repository';
import type { UnsubscribeSender } from '../../ports/unsubscribe-sender';
import { byDateAscending } from '../shared/dates';
import { offersUnsubscribe, parseListUnsubscribe } from './list-unsubscribe';

const SCANNED_MESSAGES = 5;

export interface UnsubscribeServiceDeps {
  readonly messages: MessageRepository;
  readonly sender?: UnsubscribeSender;
}

export class UnsubscribeService {
  constructor(private readonly deps: UnsubscribeServiceDeps) {}

  async options(userId: UserId, threadId: ThreadId): Promise<UnsubscribeOptions> {
    const messages = await this.deps.messages.listByThread(userId, threadId);
    if (messages.length === 0) {
      throw new NotFoundError('Thread', threadId);
    }
    const newest = [...messages].sort(byDateAscending).reverse().slice(0, SCANNED_MESSAGES);
    for (const message of newest) {
      const headers = await this.deps.messages.findHeaders(userId, message.id);
      const options = headers === null ? NO_UNSUBSCRIBE : parseListUnsubscribe(headers);
      if (offersUnsubscribe(options)) {
        return options;
      }
    }
    return NO_UNSUBSCRIBE;
  }

  async unsubscribe(userId: UserId, threadId: ThreadId): Promise<void> {
    const options = await this.options(userId, threadId);
    if (!options.oneClick || options.url === null) {
      throw new ValidationError('The sender does not support one-click unsubscribe');
    }
    if (this.deps.sender === undefined) {
      throw new NotImplementedError('One-click unsubscribe');
    }
    await this.deps.sender.sendOneClick(options.url);
  }
}

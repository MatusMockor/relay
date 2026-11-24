import type { Message } from '@relay/shared/domain';
import type { MessageBodyStore } from '../../ports/message-body-store';
import type { HydrationParse } from '../bodies/hydration-parse';

export class RemoteBodyFill {
  constructor(
    private readonly store: MessageBodyStore,
    private readonly parse: HydrationParse,
  ) {}

  async fill(message: Message, source: Uint8Array | null): Promise<boolean> {
    if (source === null || message.bodyState !== 'remote') {
      return false;
    }
    const body = await this.parse.parse(source, {
      messageId: message.id,
      threadId: message.threadId,
      mailboxId: message.mailboxId,
      uid: message.uid,
      messageIdHeader: message.messageIdHeader,
      snippet: message.snippet,
      attachments: message.attachments,
    });
    if (body === null) {
      return false;
    }
    return this.store.saveBody(message.id, body);
  }
}

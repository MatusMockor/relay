import type { MailboxId, Message } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import type { MessageUidLookup } from '../../ports/message-uid-lookup';

export class SearchHitResolver {
  constructor(
    private readonly messages: MessageRepository,
    private readonly lookup: MessageUidLookup | undefined,
  ) {}

  async stored(mailboxId: MailboxId, uids: readonly number[]): Promise<Map<number, Message>> {
    if (uids.length === 0) {
      return new Map();
    }
    const found = await this.find(mailboxId, uids);
    return new Map(found.map((message) => [message.uid, message]));
  }

  private async find(mailboxId: MailboxId, uids: readonly number[]): Promise<Message[]> {
    if (this.lookup !== undefined) {
      return this.lookup.findByUids(mailboxId, uids);
    }
    const found = await Promise.all(
      uids.map((uid) => this.messages.findByLocation({ mailboxId, uid })),
    );
    return found.filter((message): message is Message => message !== null);
  }
}

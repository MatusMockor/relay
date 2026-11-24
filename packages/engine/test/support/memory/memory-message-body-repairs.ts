import type { MailboxId, Message, MessageId } from '@relay/shared/domain';
import type {
  BodyRepairCandidate,
  MessageBodyRepairRepository,
  RepairedMessageBody,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { placedIn } from './memory-placements';

const REPLACEMENT_CHARACTER = '\uFFFD';

const isCorrupted = (message: Message): boolean =>
  [message.textBody, message.htmlBody, message.snippet].some(
    (value) => value?.includes(REPLACEMENT_CHARACTER) ?? false,
  );

export class MemoryMessageBodyRepairs implements MessageBodyRepairRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<BodyRepairCandidate[]> {
    const candidates = [...this.db.tables.messages.values()]
      .filter(isCorrupted)
      .flatMap((message) =>
        placedIn(message, mailboxId)
          .filter((placement) => placement.uid > afterUid)
          .map((placement) => ({
            messageId: message.id,
            threadId: message.threadId,
            uid: placement.uid,
            messageIdHeader: message.messageIdHeader,
          })),
      )
      .sort((left, right) => left.uid - right.uid)
      .slice(0, limit);
    return Promise.resolve(candidates);
  }

  updateBody(messageId: MessageId, body: RepairedMessageBody): Promise<void> {
    const message = this.db.tables.messages.get(messageId);
    if (message !== undefined) {
      this.db.tables.messages.set(messageId, { ...message, ...body });
    }
    return Promise.resolve();
  }
}

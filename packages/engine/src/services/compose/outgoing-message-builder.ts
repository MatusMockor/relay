import type { DraftContent, MailAccount, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { OutgoingAttachment, OutgoingMessage } from '../../model/outgoing-message';
import type { AttachmentStore } from '../../ports/attachment-store';
import type { MessageRepository } from '../../ports/message-repository';

export class OutgoingMessageBuilder {
  constructor(
    private readonly messages: MessageRepository,
    private readonly attachments: AttachmentStore,
  ) {}

  async build(
    userId: UserId,
    account: MailAccount,
    content: DraftContent,
  ): Promise<OutgoingMessage> {
    const threading = await this.threading(userId, content);
    return {
      from: { name: account.senderName, email: account.email },
      to: content.to,
      cc: content.cc,
      bcc: content.bcc,
      subject: content.subject,
      text: content.body,
      html: null,
      ...threading,
      attachments: await this.loadAttachments(userId, content),
    };
  }

  private async threading(
    userId: UserId,
    content: DraftContent,
  ): Promise<Pick<OutgoingMessage, 'inReplyTo' | 'references'>> {
    if (content.inReplyToMessageId === null) {
      return { inReplyTo: null, references: [] };
    }
    const replied = await this.messages.findById(userId, content.inReplyToMessageId);
    if (replied === null) {
      throw new NotFoundError('Message', content.inReplyToMessageId);
    }
    const header = replied.messageIdHeader;
    return {
      inReplyTo: header,
      references: header === null ? replied.references : [...replied.references, header],
    };
  }

  private async loadAttachments(
    userId: UserId,
    content: DraftContent,
  ): Promise<OutgoingAttachment[]> {
    const loaded: OutgoingAttachment[] = [];
    for (const attachment of content.attachments) {
      const stored = await this.attachments.get(userId, attachment.id);
      if (stored === null) {
        throw new NotFoundError('Attachment', attachment.id);
      }
      loaded.push({
        filename: stored.attachment.filename,
        contentType: stored.attachment.contentType,
        content: stored.content,
      });
    }
    return loaded;
  }
}

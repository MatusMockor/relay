import type { AttachmentId, UserId } from '@relay/shared/domain';
import type { AttachmentContent } from '../../model/attachment';
import type { AccountRepository } from '../../ports/account-repository';
import type { AttachmentExtractor } from '../../ports/attachment-extractor';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MessageAttachmentLookup } from '../../ports/message-attachment-lookup';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';

export interface ReceivedAttachmentReaderDeps {
  readonly lookup: MessageAttachmentLookup;
  readonly extractor: AttachmentExtractor;
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly sessions: MailProviderSessions;
}

export class ReceivedAttachmentReader {
  constructor(private readonly deps: ReceivedAttachmentReaderDeps) {}

  async read(userId: UserId, attachmentId: AttachmentId): Promise<AttachmentContent | null> {
    const message = await this.deps.lookup.findByAttachmentId(userId, attachmentId);
    if (message === null || message.uid === PENDING_UID) {
      return null;
    }
    const index = message.attachments.findIndex((attachment) => attachment.id === attachmentId);
    const meta = message.attachments[index];
    const account = await this.deps.accounts.findById(userId, message.accountId);
    const mailbox = await this.deps.mailboxes.findById(message.mailboxId);
    if (meta === undefined || account === null || mailbox === null) {
      return null;
    }
    const raw = await this.deps.sessions.with(account, (provider) =>
      provider.fetchMessage(mailbox.path, message.uid),
    );
    const extracted = raw === null ? null : await this.deps.extractor.extract(raw.source, index);
    if (extracted === null) {
      return null;
    }
    return {
      filename: meta.filename ?? extracted.filename,
      contentType: meta.contentType,
      content: extracted.content,
    };
  }
}

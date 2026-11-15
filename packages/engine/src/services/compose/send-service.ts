import type { Draft, DraftContent, ThreadId, UserId } from '@relay/shared/domain';
import { NotFoundError, ProviderError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { CredentialVault } from '../../ports/credential-vault';
import type { Logger } from '../../ports/logger';
import type { MailSender } from '../../ports/mail-sender';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { DraftService } from './draft-service';
import type { OutgoingMessageBuilder } from './outgoing-message-builder';
import type { SentMessageRecorder } from './sent-message-recorder';

export interface SentOutcome {
  readonly messageIdHeader: string | null;
  readonly threadId: ThreadId | null;
}

export interface SendServiceDeps {
  readonly accounts: AccountRepository;
  readonly vault: CredentialVault;
  readonly sender: MailSender;
  readonly builder: OutgoingMessageBuilder;
  readonly recorder: SentMessageRecorder;
  readonly drafts: DraftService;
  readonly logger: Logger;
}

export class SendService {
  constructor(private readonly deps: SendServiceDeps) {}

  async sendNow(
    userId: UserId,
    content: DraftContent,
    sentDraft: Draft | null,
  ): Promise<SentOutcome> {
    if (content.to.length + content.cc.length + content.bcc.length === 0) {
      throw new ValidationError('A message needs at least one recipient');
    }
    const account = await this.deps.accounts.findById(userId, content.accountId);
    if (account === null) {
      throw new NotFoundError('Account', content.accountId);
    }
    const credentials = await this.deps.vault.get(account.id);
    if (credentials === null) {
      throw new ProviderError(`No credentials stored for account ${account.email}`);
    }
    const outgoing = await this.deps.builder.build(userId, account, content);
    const sent = await this.deps.sender
      .send(account, credentials, outgoing)
      .catch((error: unknown) => {
        throw new ProviderError(`Sending failed: ${errorMessage(error)}`, { cause: error });
      });
    const threadId = await this.deps.recorder.record(userId, account, sent);
    if (sentDraft !== null) {
      await this.deps.drafts.deleteSent(userId, sentDraft).catch((error: unknown) => {
        this.deps.logger.warn('Removing a sent draft failed', {
          draftId: sentDraft.id,
          error: errorMessage(error),
        });
      });
    }
    return {
      messageIdHeader: sent.messageIdHeader,
      threadId: threadId ?? content.inReplyToThreadId,
    };
  }
}
